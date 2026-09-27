import type {PlanEntryDTO} from "@wattwerk/shared"
import {CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model} from "sequelize"
import {sequelize} from "./db"
import {DBUser} from "./DBUser"
import {DBWorkout} from "./DBWorkout"

/**
 * Ein Eintrag im Wochenplan. Siehe `SavePlanRequest` in `@wattwerk/shared`
 * dazu, warum der Plan nur als Ganzes ersetzt wird.
 *
 * Keine Verknüpfung zu `DBWorkout`: die Tabelle hat absichtlich keinen
 * Fremdschlüssel auf `workout` (siehe V6), und ein `include` sähe fremde
 * private Programme genauso wie eigene. Das Programm löst `PlanService`
 * selbst auf, samt Sichtbarkeitsprüfung.
 */
export class DBPlanEntry extends Model<InferAttributes<DBPlanEntry>, InferCreationAttributes<DBPlanEntry>> {
    declare id: string
    declare userID: number
    /** ISO 8601: 1 = Montag … 7 = Sonntag. */
    declare weekday: number
    declare workoutID: string
    declare workoutName: string
    declare sortIndex: CreationOptional<number>
    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    /** `workout` nur, wenn der Nutzer es sehen darf - das entscheidet der Aufrufer. */
    public toDTO(workout: DBWorkout | null): PlanEntryDTO {
        return {
            id: this.id,
            weekday: this.weekday,
            workoutID: this.workoutID,
            workoutName: this.workoutName,
            sortIndex: this.sortIndex,
            workout: workout?.toDTO() ?? null,
        }
    }
}

DBPlanEntry.init(
    {
        id: {type: DataTypes.CHAR(36), primaryKey: true},
        userID: {type: DataTypes.INTEGER, allowNull: false},
        weekday: {type: DataTypes.TINYINT, allowNull: false},
        workoutID: {type: DataTypes.CHAR(36), allowNull: false},
        workoutName: {type: DataTypes.STRING(200), allowNull: false},
        sortIndex: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize,
        tableName: "planEntry",
    }
)

DBUser.hasMany(DBPlanEntry, {foreignKey: "userID", as: "planEntries"})
DBPlanEntry.belongsTo(DBUser, {foreignKey: "userID", as: "user"})
