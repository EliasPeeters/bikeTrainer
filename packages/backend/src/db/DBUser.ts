import {UserResponse} from "@wattwerk/shared"
import {CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model} from "sequelize"
import {sequelize} from "./db"

export class DBUser extends Model<InferAttributes<DBUser>, InferCreationAttributes<DBUser>> {
    declare id: CreationOptional<number>
    /** Immer normalisiert gespeichert (getrimmt, klein) - siehe `normalizeEmail`. */
    declare email: string
    declare passwordHash: string
    declare name: CreationOptional<string>

    declare mailContactAllowed: CreationOptional<boolean>

    declare ftp: CreationOptional<number>
    declare maxHeartRate: CreationOptional<number>
    declare restingHeartRate: CreationOptional<number>
    declare weightKg: CreationOptional<number>

    declare lastLoginAt: CreationOptional<Date | null>
    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    /**
     * Die Form, die nach aussen geht. Eigene Methode, damit der Passwort-Hash
     * nicht aus Versehen in einer Antwort landet: wer `user.toJSON()` schickt,
     * verschickt ihn mit.
     */
    public toResponse(): UserResponse {
        return {
            id: this.id,
            email: this.email,
            name: this.name,
            // Boolean statt "!== null": eine frisch angelegte Instanz liefert
            // fuer ein nie gesetztes Feld undefined, nicht null.
            mailContactAllowed: Boolean(this.mailContactAllowed),
            ftp: this.ftp,
            maxHeartRate: this.maxHeartRate,
            restingHeartRate: this.restingHeartRate,
            weightKg: this.weightKg,
            createdAt: this.createdAt.toISOString(),
        }
    }
}

DBUser.init(
    {
        id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
        email: {type: DataTypes.STRING(255), allowNull: false, unique: true},
        passwordHash: {type: DataTypes.STRING(255), allowNull: false},
        name: {type: DataTypes.STRING(120), allowNull: false, defaultValue: ""},
        mailContactAllowed: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
        ftp: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 200},
        maxHeartRate: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 185},
        restingHeartRate: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 55},
        weightKg: {type: DataTypes.FLOAT, allowNull: false, defaultValue: 75},
        lastLoginAt: {type: DataTypes.DATE, allowNull: true},
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize,
        tableName: "user",
    }
)

/**
 * E-Mail-Adressen werden vor jedem Vergleich normalisiert.
 *
 * Ohne das legen "Max@example.com" und "max@example.com " zwei Konten an, und
 * der eindeutige Index verhindert es nicht - fuer die Datenbank sind es
 * verschiedene Zeichenketten. Auffallen wuerde es erst, wenn jemand sich nicht
 * mehr anmelden kann, weil er beim Tippen gross angefangen hat.
 */
export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase()
}

export async function userByEmail(email: string): Promise<DBUser | null> {
    return await DBUser.findOne({where: {email: normalizeEmail(email)}})
}
