import {CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model} from "sequelize"
import {sequelize} from "./db"

/**
 * Die drei Tabellen des Autorisierungsservers.
 *
 * Zusammen in einer Datei, weil sie nur miteinander Sinn ergeben: ein Client
 * bekommt einen Code, aus dem Code wird eine Verbindung. Einzeln wäre jede von
 * ihnen ein Torso.
 */

/** Über Dynamic Client Registration angemeldet. Clients mit URL-Kennung stehen hier nicht. */
export class DBOAuthClient extends Model<
    InferAttributes<DBOAuthClient>,
    InferCreationAttributes<DBOAuthClient>
> {
    declare id: CreationOptional<number>
    declare clientID: string
    declare clientName: string
    declare redirectUris: string[]
    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}

DBOAuthClient.init(
    {
        id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
        clientID: {type: DataTypes.STRING(255), allowNull: false, unique: true},
        clientName: {type: DataTypes.STRING(200), allowNull: false},
        redirectUris: {type: DataTypes.JSON, allowNull: false},
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {sequelize, tableName: "oauthClient"}
)

/** Ein Autorisierungscode: kurzlebig, genau einmal einlösbar. */
export class DBOAuthCode extends Model<
    InferAttributes<DBOAuthCode>,
    InferCreationAttributes<DBOAuthCode>
> {
    declare id: CreationOptional<number>
    declare codeHash: string
    declare clientID: string
    declare userID: number
    declare redirectUri: string
    declare codeChallenge: string
    declare resource: string
    declare scope: string
    declare expiresAt: Date
    declare usedAt: CreationOptional<Date | null>
    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    public isExpired(): boolean {
        return this.expiresAt.getTime() <= Date.now()
    }
}

DBOAuthCode.init(
    {
        id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
        codeHash: {type: DataTypes.CHAR(64), allowNull: false, unique: true},
        clientID: {type: DataTypes.STRING(255), allowNull: false},
        userID: {type: DataTypes.INTEGER, allowNull: false},
        redirectUri: {type: DataTypes.STRING(2048), allowNull: false},
        codeChallenge: {type: DataTypes.STRING(128), allowNull: false},
        resource: {type: DataTypes.STRING(2048), allowNull: false},
        scope: {type: DataTypes.STRING(255), allowNull: false},
        expiresAt: {type: DataTypes.DATE, allowNull: false},
        usedAt: {type: DataTypes.DATE, allowNull: true},
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {sequelize, tableName: "oauthCode"}
)

/** Eine erteilte Verbindung, die der Nutzer im Portal wieder zurücknehmen kann. */
export class DBOAuthGrant extends Model<
    InferAttributes<DBOAuthGrant>,
    InferCreationAttributes<DBOAuthGrant>
> {
    declare id: CreationOptional<number>
    declare userID: number
    declare clientID: string
    declare clientName: string
    declare refreshTokenHash: string
    declare scope: string
    declare resource: string
    declare lastUsedAt: CreationOptional<Date | null>
    declare expiresAt: CreationOptional<Date | null>
    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    public isExpired(): boolean {
        return this.expiresAt !== null && this.expiresAt !== undefined && this.expiresAt.getTime() <= Date.now()
    }
}

DBOAuthGrant.init(
    {
        id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
        userID: {type: DataTypes.INTEGER, allowNull: false},
        clientID: {type: DataTypes.STRING(255), allowNull: false},
        clientName: {type: DataTypes.STRING(200), allowNull: false},
        refreshTokenHash: {type: DataTypes.CHAR(64), allowNull: false, unique: true},
        scope: {type: DataTypes.STRING(255), allowNull: false},
        resource: {type: DataTypes.STRING(2048), allowNull: false},
        lastUsedAt: {type: DataTypes.DATE, allowNull: true},
        expiresAt: {type: DataTypes.DATE, allowNull: true},
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {sequelize, tableName: "oauthGrant"}
)
