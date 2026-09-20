import type {CollectionDTO, WorkoutVisibility} from "@wattwerk/shared"
import {CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model} from "sequelize"
import {sequelize} from "./db"
import {DBUser} from "./DBUser"
import {DBWorkout} from "./DBWorkout"

/**
 * Ordner und Playlist in einem. Siehe `CollectionDTO` in `@wattwerk/shared`
 * dazu, warum das ein Begriff ist und nicht zwei.
 */
export class DBCollection extends Model<
    InferAttributes<DBCollection>,
    InferCreationAttributes<DBCollection>
> {
    declare id: string
    declare ownerUserID: number
    declare name: string
    declare summary: CreationOptional<string>
    declare visibility: CreationOptional<WorkoutVisibility>
    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    declare owner?: DBUser

    public toDTO(workouts: DBWorkout[]): CollectionDTO {
        return {
            id: this.id,
            name: this.name,
            summary: this.summary,
            visibility: this.visibility,
            ownerUserID: this.ownerUserID,
            ownerName: this.owner?.name ?? null,
            workouts: workouts.map((workout) => workout.toDTO()),
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        }
    }
}

DBCollection.init(
    {
        id: {type: DataTypes.CHAR(36), primaryKey: true},
        ownerUserID: {type: DataTypes.INTEGER, allowNull: false},
        name: {type: DataTypes.STRING(200), allowNull: false},
        summary: {type: DataTypes.STRING(500), allowNull: false, defaultValue: ""},
        visibility: {
            type: DataTypes.ENUM("private", "public"),
            allowNull: false,
            defaultValue: "private",
        },
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize,
        tableName: "collection",
    }
)

export class DBCollectionItem extends Model<
    InferAttributes<DBCollectionItem>,
    InferCreationAttributes<DBCollectionItem>
> {
    declare collectionID: string
    declare workoutID: string
    declare sortIndex: CreationOptional<number>
    declare addedAt: CreationOptional<Date>
}

DBCollectionItem.init(
    {
        collectionID: {type: DataTypes.CHAR(36), primaryKey: true},
        workoutID: {type: DataTypes.CHAR(36), primaryKey: true},
        sortIndex: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
        addedAt: {type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW},
    },
    {
        sequelize,
        tableName: "collectionItem",
        // Die Tabelle hat addedAt statt createdAt/updatedAt: ein Eintrag wird
        // hinzugefügt oder entfernt, geändert wird er nie.
        timestamps: false,
    }
)

DBUser.hasMany(DBCollection, {foreignKey: "ownerUserID", as: "collections"})
DBCollection.belongsTo(DBUser, {foreignKey: "ownerUserID", as: "owner"})
DBCollection.belongsToMany(DBWorkout, {
    through: DBCollectionItem,
    foreignKey: "collectionID",
    otherKey: "workoutID",
    as: "workouts",
})
DBWorkout.belongsToMany(DBCollection, {
    through: DBCollectionItem,
    foreignKey: "workoutID",
    otherKey: "collectionID",
    as: "collections",
})
