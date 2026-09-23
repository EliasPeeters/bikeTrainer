import {TrainingSessionResponse} from "@wattwerk/shared"
import {CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model} from "sequelize"
import {sequelize} from "./db"
import {DBUser} from "./DBUser"

export class DBTrainingSession extends Model<
    InferAttributes<DBTrainingSession>,
    InferCreationAttributes<DBTrainingSession>
> {
    declare id: CreationOptional<number>
    declare userID: number
    declare clientID: string

    declare workoutName: string
    /** Verknüpfung zum Programm, soweit die Einheit eins hatte. */
    declare workoutID: CreationOptional<string | null>
    declare startedAt: Date
    declare durationSeconds: number
    declare completed: boolean

    declare ftp: number
    declare averagePower: number
    declare maxPower: number
    declare normalizedPower: number
    declare intensityFactor: number
    declare trainingStressScore: number
    declare kilojoules: number
    declare averageCadence: CreationOptional<number | null>
    declare averageHeartRate: CreationOptional<number | null>
    declare maxHeartRate: CreationOptional<number | null>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    /**
     * `hasTrack` kommt von aussen, weil die Spur in einer eigenen Tabelle liegt
     * und der Verlauf sie nicht mitlaedt. Der Aufrufer weiss nach einer
     * einzigen Abfrage ueber alle Einheiten hinweg, welche eine hat - hier
     * nachzusehen waere eine Abfrage je Zeile.
     */
    public toResponse(hasTrack = false): TrainingSessionResponse {
        return {
            id: this.id,
            clientID: this.clientID,
            workoutName: this.workoutName,
            workoutID: this.workoutID ?? null,
            startedAt: this.startedAt.toISOString(),
            durationSeconds: this.durationSeconds,
            completed: this.completed,
            ftp: this.ftp,
            averagePower: this.averagePower,
            maxPower: this.maxPower,
            normalizedPower: this.normalizedPower,
            intensityFactor: this.intensityFactor,
            trainingStressScore: this.trainingStressScore,
            kilojoules: this.kilojoules,
            averageCadence: this.averageCadence,
            averageHeartRate: this.averageHeartRate,
            maxHeartRate: this.maxHeartRate,
            createdAt: this.createdAt.toISOString(),
            hasTrack,
        }
    }
}

DBTrainingSession.init(
    {
        id: {type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true},
        userID: {type: DataTypes.INTEGER, allowNull: false},
        clientID: {type: DataTypes.CHAR(36), allowNull: false},
        workoutName: {type: DataTypes.STRING(200), allowNull: false},
        workoutID: {type: DataTypes.CHAR(36), allowNull: true},
        startedAt: {type: DataTypes.DATE, allowNull: false},
        durationSeconds: {type: DataTypes.INTEGER, allowNull: false},
        completed: {type: DataTypes.BOOLEAN, allowNull: false},
        ftp: {type: DataTypes.INTEGER, allowNull: false},
        averagePower: {type: DataTypes.INTEGER, allowNull: false},
        maxPower: {type: DataTypes.INTEGER, allowNull: false},
        normalizedPower: {type: DataTypes.INTEGER, allowNull: false},
        intensityFactor: {type: DataTypes.FLOAT, allowNull: false},
        trainingStressScore: {type: DataTypes.INTEGER, allowNull: false},
        kilojoules: {type: DataTypes.INTEGER, allowNull: false},
        averageCadence: {type: DataTypes.INTEGER, allowNull: true},
        averageHeartRate: {type: DataTypes.INTEGER, allowNull: true},
        maxHeartRate: {type: DataTypes.INTEGER, allowNull: true},
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize,
        tableName: "trainingSession",
    }
)

DBUser.hasMany(DBTrainingSession, {foreignKey: "userID", as: "trainingSessions"})
DBTrainingSession.belongsTo(DBUser, {foreignKey: "userID", as: "user"})
