import {StrictMode} from "react"
import {createRoot} from "react-dom/client"
import {BrowserRouter} from "react-router-dom"
import {App} from "./App"
import {AuthProvider} from "./api/auth"
import "./styles.css"

const container = document.getElementById("root")
if (container === null) {
    throw new Error("Kein #root im Dokument - index.html passt nicht zum Bundle.")
}

createRoot(container).render(
    <StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <App />
            </AuthProvider>
        </BrowserRouter>
    </StrictMode>
)
