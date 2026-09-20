import {NavLink, Outlet} from "react-router-dom"
import {useAuth} from "../api/auth"

const LINKS = [
    {to: "/app", label: "Übersicht", end: true},
    {to: "/app/bibliothek", label: "Bibliothek"},
    {to: "/app/verlauf", label: "Verlauf"},
    {to: "/app/profil", label: "Profil"},
]

export function PortalLayout() {
    const {user, logout} = useAuth()

    return (
        <div className="portal">
            <header className="portal-top">
                <div className="page portal-top-inner">
                    <NavLink to="/app" className="logo">
                        <img className="logo-mark" src="/icon-180.png" alt="" />
                        Wattwerk
                    </NavLink>

                    <nav className="portal-nav">
                        {LINKS.map((link) => (
                            <NavLink
                                key={link.to}
                                to={link.to}
                                end={link.end}
                                className={({isActive}) => (isActive ? "portal-link active" : "portal-link")}
                            >
                                {link.label}
                            </NavLink>
                        ))}
                    </nav>

                    <div className="portal-user">
                        <span className="muted tiny">{user?.name || user?.email}</span>
                        <button type="button" className="ghost" onClick={logout}>
                            Abmelden
                        </button>
                    </div>
                </div>
            </header>

            <main className="page portal-main">
                <Outlet />
            </main>

            <footer className="page bottom">
                <span>Wattwerk</span>
                <NavLink to="/datenschutz">Datenschutz</NavLink>
            </footer>
        </div>
    )
}
