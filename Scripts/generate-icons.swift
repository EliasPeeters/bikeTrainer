// Erzeugt alle App-Symbole aus den Grafiken in assets/.
//
//     swift Scripts/generate-icons.swift
//
// Quellen und wofür sie taugen:
//   app logo.png              Squircle mit transparentem Rand -> macOS
//   app logo fullscreen.png   randlos, dunkler Verlauf -> Hintergrundebene tvOS
//   logo.png                  freigestellt (Alpha 0 im Hintergrund) -> Vordergrund,
//                             Top Shelf und Favicon
//
// Zwei Fallstricke, die hier gelöst sind:
//   - Die unterste Ebene eines tvOS-Stapels muss vollständig deckend sein.
//     Weichzeichnen lässt die Ränder ins Durchsichtige laufen, deshalb liegt
//     eine undurchsichtige Fläche darunter.
//   - Die Marke über ihre Helligkeit freizustellen verfälscht die Farben
//     (aus Blau wird Cyan). logo.png ist bereits freigestellt - das reicht.

import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins

let root = "/Users/eliaspeeters/GitHub/bikeTrainer"
let ciContext = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])

func load(_ name: String) -> CIImage {
    guard let image = CIImage(contentsOf: URL(fileURLWithPath: "\(root)/assets/\(name)")) else {
        fatalError("Fehlt: \(name)")
    }
    return image
}

func write(_ image: CIImage, size: CGSize, to path: String) {
    let url = URL(fileURLWithPath: path)
    try? FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let rect = CGRect(origin: .zero, size: size)
    guard let cg = ciContext.createCGImage(image, from: rect) else { fatalError("Rendern fehlgeschlagen: \(path)") }
    let rep = NSBitmapImageRep(cgImage: cg)
    rep.size = size
    guard let data = rep.representation(using: .png, properties: [:]) else { fatalError("PNG fehlgeschlagen") }
    try! data.write(to: url)
}

/// Skaliert ein Bild so, dass es die Zielgröße vollständig ausfüllt, und
/// schneidet mittig zu.
func fill(_ source: CIImage, _ size: CGSize) -> CIImage {
    let extent = source.extent
    let scale = max(size.width / extent.width, size.height / extent.height)
    let scaled = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let dx = (scaled.extent.width - size.width) / 2
    let dy = (scaled.extent.height - size.height) / 2
    return scaled
        .transformed(by: CGAffineTransform(translationX: -scaled.extent.minX - dx, y: -scaled.extent.minY - dy))
        .cropped(to: CGRect(origin: .zero, size: size))
}

/// Legt ein Bild mittig auf eine Fläche, ohne es zu beschneiden.
func fit(_ source: CIImage, _ size: CGSize, margin: CGFloat, background: CIImage) -> CIImage {
    let extent = source.extent
    let available = CGSize(width: size.width * (1 - margin * 2), height: size.height * (1 - margin * 2))
    let scale = min(available.width / extent.width, available.height / extent.height)
    let scaled = source.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let x = (size.width - scaled.extent.width) / 2 - scaled.extent.minX
    let y = (size.height - scaled.extent.height) / 2 - scaled.extent.minY
    let placed = scaled.transformed(by: CGAffineTransform(translationX: x, y: y))
    return placed.composited(over: background).cropped(to: CGRect(origin: .zero, size: size))
}

func solid(_ color: CIColor, _ size: CGSize) -> CIImage {
    CIImage(color: color).cropped(to: CGRect(origin: .zero, size: size))
}

// MARK: macOS

// Die Quelle hat den Squircle samt transparentem Rand schon - genau die Form,
// die macOS erwartet. Also nur skalieren, nichts hinzufügen.
let macSource = load("app logo.png")
let macSizes: [(Int, Int)] = [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)]
for (points, scale) in macSizes {
    let pixels = CGFloat(points * scale)
    let name = scale == 1 ? "icon_\(points)x\(points).png" : "icon_\(points)x\(points)@2x.png"
    write(fill(macSource, CGSize(width: pixels, height: pixels)),
          size: CGSize(width: pixels, height: pixels),
          to: "\(root)/Apps/Mac/Assets.xcassets/AppIcon.appiconset/\(name)")
}
print("macOS: \(macSizes.count) Dateien")

// MARK: tvOS

let tvSource = load("app logo fullscreen.png")
// logo.png ist bereits freigestellt: der Hintergrund hat Alpha 0, nur Marke und
// Schein stehen darin. Das erspart jedes Freistellen über Helligkeit - und
// genau das hatte die Farben verfälscht, aus dem Blau wurde Cyan.
let mark = load("logo.png")

/// Der Hintergrund einer Ebenen-Grafik: dieselbe Vorlage, weich gezeichnet und
/// abgedunkelt. Das "W" verschwimmt zu einem Schein, vor dem der Vordergrund
/// beim Kippen der Fernbedienung sichtbar wandert.
func backdrop(_ source: CIImage, size: CGSize, blur: Double) -> CIImage {
    // Vor dem Weichzeichnen größer beschneiden, sonst zieht der Filter die
    // Ränder ins Durchsichtige und das Bild bekommt einen hellen Saum.
    let oversized = CGSize(width: size.width * 1.3, height: size.height * 1.3)
    let wide = fill(source, oversized)
        .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: blur])
        .applyingFilter("CIExposureAdjust", parameters: [kCIInputEVKey: -1.1])
    let dx = (oversized.width - size.width) / 2
    let dy = (oversized.height - size.height) / 2
    let cropped = wide
        .transformed(by: CGAffineTransform(translationX: -dx, y: -dy))
        .cropped(to: CGRect(origin: .zero, size: size))
    // Die unterste Ebene eines tvOS-Stapels muss vollständig deckend sein -
    // actool lehnt sie sonst ab. Die Weichzeichnung lässt die Ränder ins
    // Durchsichtige laufen, also kommt eine undurchsichtige Fläche darunter.
    return cropped.composited(over: solid(CIColor(red: 0.051, green: 0.059, blue: 0.078), size))
        .cropped(to: CGRect(origin: .zero, size: size))
}

func writeLayer(_ image: CIImage, size: CGSize, stack: String, layer: String, scale: Int) {
    let base = "\(root)/Apps/TV/Assets.xcassets/App Icon & Top Shelf Image.brandassets/\(stack)/\(layer).imagestacklayer/Content.imageset"
    let name = scale == 1 ? "\(layer.lowercased()).png" : "\(layer.lowercased())@2x.png"
    write(image, size: size, to: "\(base)/\(name)")
}

/// tvOS-Symbole sind 400x240. Die quadratische Vorlage wird mittig auf 5:3
/// beschnitten; das "W" liegt im mittleren Drittel und bleibt vollständig drin.
func buildStack(_ stack: String, size: CGSize, scale: Int, blur: Double) {
    let pixelSize = CGSize(width: size.width * CGFloat(scale), height: size.height * CGFloat(scale))
    writeLayer(backdrop(tvSource, size: pixelSize, blur: blur * Double(scale)),
               size: pixelSize, stack: stack, layer: "Back", scale: scale)
    writeLayer(fit(mark, pixelSize, margin: 0.04, background: CIImage.empty()),
               size: pixelSize, stack: stack, layer: "Front", scale: scale)
}

buildStack("App Icon.imagestack", size: CGSize(width: 400, height: 240), scale: 1, blur: 58)
buildStack("App Icon.imagestack", size: CGSize(width: 400, height: 240), scale: 2, blur: 58)
buildStack("App Icon - App Store.imagestack", size: CGSize(width: 1280, height: 768), scale: 1, blur: 185)
print("tvOS: Symbolebenen erzeugt")

// Top Shelf: das breite Logo auf Schwarz. Der Schein läuft ohnehin nach
// Durchsichtig aus, die Fläche geht also nahtlos über.
let black = CIColor(red: 0, green: 0, blue: 0)
for (name, base) in [
    ("Top Shelf Image", CGSize(width: 1920, height: 720)),
    ("Top Shelf Image Wide", CGSize(width: 2320, height: 720)),
] {
    for scale in [1, 2] {
        let size = CGSize(width: base.width * CGFloat(scale), height: base.height * CGFloat(scale))
        let image = fit(mark, size, margin: 0.14, background: solid(black, size))
        let file = scale == 1 ? "topshelf.png" : "topshelf@2x.png"
        write(image, size: size,
              to: "\(root)/Apps/TV/Assets.xcassets/App Icon & Top Shelf Image.brandassets/\(name).imageset/\(file)")
    }
}
print("tvOS: Top-Shelf-Bilder erzeugt")

// MARK: Web

// Favicon aus derselben Quelle, damit der Tab dasselbe Zeichen trägt.
for size in [32, 180, 512] {
    write(fill(macSource, CGSize(width: CGFloat(size), height: CGFloat(size))),
          size: CGSize(width: CGFloat(size), height: CGFloat(size)),
          to: "\(root)/packages/landingpage/public/icon-\(size).png")
}
write(fit(mark, CGSize(width: 1200, height: 630), margin: 0.12, background: solid(CIColor(red: 0.051, green: 0.059, blue: 0.078), CGSize(width: 1200, height: 630))), size: CGSize(width: 1200, height: 630),
      to: "\(root)/packages/landingpage/public/social.png")
print("Web: Favicons erzeugt")
