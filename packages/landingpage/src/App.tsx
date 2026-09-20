import {Navigate, Route, Routes} from "react-router-dom"
import {useAuth} from "./api/auth"
import {PortalLayout} from "./pages/PortalLayout"
import {DashboardPage} from "./pages/DashboardPage"
import {HistoryPage} from "./pages/HistoryPage"
import {LandingPage} from "./pages/LandingPage"
import {LibraryPage} from "./pages/LibraryPage"
import {ImprintPage} from "./pages/ImprintPage"
import {PrivacyPage} from "./pages/PrivacyPage"
import {ProfilePage} from "./pages/ProfilePage"
import {WorkoutDetailPage} from "./pages/WorkoutDetailPage"
import {WorkoutEditorPage} from "./pages/WorkoutEditorPage"

export function App() {
    const {user, loading} = useAuth()

    // Solange offen ist, ob das gespeicherte Token noch trägt, wird nichts
    // entschieden - sonst blitzt die Anmeldemaske auf, obwohl man angemeldet ist.
    if (loading) {
        return (
            <div className="page center">
                <p className="muted">Einen Moment …</p>
            </div>
        )
    }

    return (
        <Routes>
            <Route path="/" element={user === null ? <LandingPage /> : <Navigate to="/app" replace />} />
            {/* Ohne Anmeldung erreichbar - App Store Connect ruft die Adresse
                auf, und zwar ohne Konto. Das Impressum muss aus demselben Grund
                offen liegen: eine Pflichtangabe hinter einer Anmeldung ist keine. */}
            <Route path="/datenschutz" element={<PrivacyPage />} />
            <Route path="/impressum" element={<ImprintPage />} />
            <Route path="/app" element={user === null ? <Navigate to="/" replace /> : <PortalLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="bibliothek" element={<LibraryPage />} />
                <Route path="programm/neu" element={<WorkoutEditorPage />} />
                <Route path="programm/:id/bearbeiten" element={<WorkoutEditorPage />} />
                <Route path="programm/:id" element={<WorkoutDetailPage />} />
                <Route path="verlauf" element={<HistoryPage />} />
                <Route path="profil" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    )
}
