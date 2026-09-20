import type {WorkoutDTO, WorkoutSegmentDTO, WorkoutVisibility} from "@wattwerk/shared"
import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    NonAttribute,
} from "sequelize"
import {sequelize} from "./db"
import {DBUser} from "./DBUser"
import {parseJSONColumn} from "./json"

export class DBWorkout extends Model<InferAttributes<DBWorkout>, InferCreationAttributes<DBWorkout>> {
    /** Die Kennung kommt vom Client, damit Anlegen und Abgleich derselbe Aufruf sind. */
    declare id: string
    /** `null` beim mitgelieferten Katalog - der gehört niemandem. */
    declare ownerUserID: number | null
    declare name: string
    declare summary: CreationOptional<string>
    // Die deklarierten Typen sind die logischen. Zur Laufzeit kann MariaDB
    // stattdessen Zeichenketten liefern - dafür sind die Zugriffe unten da.
    declare tags: string[]
    declare segments: WorkoutSegmentDTO[]
    declare visibility: CreationOptional<WorkoutVisibility>
    declare durationSeconds: number
    declare plannedTSS: CreationOptional<number>
    declare isBuiltIn: CreationOptional<boolean>
    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    declare owner?: DBUser

    // `NonAttribute`, sonst hält Sequelize die abgeleiteten Zugriffe für
    // Spalten und verlangt sie in jedem `create`.
    public get segmentList(): NonAttribute<WorkoutSegmentDTO[]> {
        return parseJSONColumn<WorkoutSegmentDTO[]>(this.segments, [])
    }

    public get tagList(): NonAttribute<string[]> {
        return parseJSONColumn<string[]>(this.tags, [])
    }

    public toDTO(): WorkoutDTO {
        return {
            id: this.id,
            name: this.name,
            summary: this.summary,
            tags: this.tagList,
            visibility: this.visibility,
            segments: this.segmentList,
            durationSeconds: this.durationSeconds,
            plannedTSS: this.plannedTSS,
            isBuiltIn: Boolean(this.isBuiltIn),
            ownerUserID: this.ownerUserID,
            ownerName: this.owner?.name ?? null,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        }
    }

    /** Sichtbar ist, was mir gehört, was öffentlich ist, oder was mitgeliefert wurde. */
    public isVisibleTo(userID: number | undefined): boolean {
        if (this.visibility === "public" || this.isBuiltIn) {
            return true
        }
        return userID !== undefined && this.ownerUserID === userID
    }
}

DBWorkout.init(
    {
        id: {type: DataTypes.CHAR(36), primaryKey: true},
        ownerUserID: {type: DataTypes.INTEGER, allowNull: true},
        name: {type: DataTypes.STRING(200), allowNull: false},
        summary: {type: DataTypes.STRING(500), allowNull: false, defaultValue: ""},
        tags: {type: DataTypes.JSON, allowNull: false},
        segments: {type: DataTypes.JSON, allowNull: false},
        visibility: {
            type: DataTypes.ENUM("private", "public"),
            allowNull: false,
            defaultValue: "private",
        },
        durationSeconds: {type: DataTypes.INTEGER, allowNull: false},
        plannedTSS: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
        isBuiltIn: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize,
        tableName: "workout",
    }
)

DBUser.hasMany(DBWorkout, {foreignKey: "ownerUserID", as: "workouts"})
DBWorkout.belongsTo(DBUser, {foreignKey: "ownerUserID", as: "owner"})
