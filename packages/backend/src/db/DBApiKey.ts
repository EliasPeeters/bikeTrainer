import {ApiKeyResponse, ApiKeyScope} from "@wattwerk/shared"
import {CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model} from "sequelize"
import {sequelize} from "./db"

export class DBApiKey extends Model<InferAttributes<DBApiKey>, InferCreationAttributes<DBApiKey>> {
    declare id: CreationOptional<number>
    declare userID: number
    declare name: string
    declare tokenHash: string
    declare preview: string
    declare scope: CreationOptional<ApiKeyScope>
    declare lastUsedAt: CreationOptional<Date | null>
    declare expiresAt: CreationOptional<Date | null>
    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    /**
     * Eine Methode und kein Getter: `InferAttributes` haelt jeden Getter fuer
     * eine Spalte und verlangt sie dann in `init` und in jedem `create`.
     */
    public isExpired(): boolean {
        return this.expiresAt !== null && this.expiresAt !== undefined && this.expiresAt.getTime() <= Date.now()
    }

    /** Ohne den Schlüssel selbst - den gibt es nur einmal, beim Anlegen. */
    public toResponse(): ApiKeyResponse {
        return {
            id: this.id,
            name: this.name,
            preview: this.preview,
            scope: this.scope,
            lastUsedAt: this.lastUsedAt?.toISOString() ?? null,
            expiresAt: this.expiresAt?.toISOString() ?? null,
            createdAt: this.createdAt.toISOString(),
        }
    }
}

DBApiKey.init(
    {
        id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
        userID: {type: DataTypes.INTEGER, allowNull: false},
        name: {type: DataTypes.STRING(120), allowNull: false},
        tokenHash: {type: DataTypes.CHAR(64), allowNull: false, unique: true},
        preview: {type: DataTypes.STRING(16), allowNull: false},
        scope: {type: DataTypes.ENUM("read", "full"), allowNull: false, defaultValue: "full"},
        lastUsedAt: {type: DataTypes.DATE, allowNull: true},
        expiresAt: {type: DataTypes.DATE, allowNull: true},
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize,
        tableName: "apiKey",
    }
)
