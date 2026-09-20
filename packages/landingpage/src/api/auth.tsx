import type {UserResponse} from "@wattwerk/shared"
import {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react"
import {api, tokenStore} from "./client"

interface AuthState {
    user: UserResponse | null
    /** Solange wahr, ist noch offen, ob ein gespeichertes Token noch gilt. */
    loading: boolean
    login: (email: string, password: string) => Promise<void>
    register: (email: string, password: string, name: string, mailContactAllowed: boolean) => Promise<void>
    logout: () => void
    setUser: (user: UserResponse) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({children}: {children: React.ReactNode}) {
    const [user, setUser] = useState<UserResponse | null>(null)
    const [loading, setLoading] = useState(true)

    // Beim Start prüfen, ob das gespeicherte Token noch trägt. Ohne diesen
    // Schritt zeigte die Seite kurz die Anmeldung, obwohl man angemeldet ist.
    useEffect(() => {
        let cancelled = false
        async function restore() {
            if (tokenStore.access === null) {
                setLoading(false)
                return
            }
            try {
                const profile = await api.me()
                if (!cancelled) {
                    setUser(profile)
                }
            } catch {
                tokenStore.clear()
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }
        void restore()
        return () => {
            cancelled = true
        }
    }, [])

    const login = useCallback(async (email: string, password: string) => {
        const response = await api.login({email, password})
        tokenStore.set(response.accessToken, response.refreshToken)
        setUser(response.user)
    }, [])

    const register = useCallback(
        async (email: string, password: string, name: string, mailContactAllowed: boolean) => {
            const response = await api.register({
                email,
                password,
                name: name.length > 0 ? name : undefined,
                mailContactAllowed,
            })
            tokenStore.set(response.accessToken, response.refreshToken)
            setUser(response.user)
        },
        []
    )

    const logout = useCallback(() => {
        tokenStore.clear()
        setUser(null)
    }, [])

    const value = useMemo<AuthState>(
        () => ({user, loading, login, register, logout, setUser}),
        [user, loading, login, register, logout]
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
    const context = useContext(AuthContext)
    if (context === null) {
        throw new Error("useAuth außerhalb von AuthProvider benutzt.")
    }
    return context
}
