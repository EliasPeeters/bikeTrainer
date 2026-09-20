import bcrypt from "bcryptjs"

/**
 * `bcryptjs` statt `bcrypt`: reines JavaScript, also kein Compiler im
 * Docker-Image und keine nativen Module, die bei jedem Node-Wechsel neu gebaut
 * werden muessen. Derselbe Algorithmus, dieselbe API - nur langsamer, was beim
 * Hashen von Passwoertern kein Nachteil ist.
 */
export class PasswordService {
    constructor(private readonly rounds = 10) {}

    public async hashPassword(password: string): Promise<string> {
        return await bcrypt.hash(password, this.rounds)
    }

    public async checkPassword(password: string, storedHash: string): Promise<boolean> {
        return await bcrypt.compare(password, storedHash)
    }
}
