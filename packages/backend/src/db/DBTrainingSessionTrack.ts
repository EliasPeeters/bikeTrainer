import type {RideTrackDTO} from "@wattwerk/shared"
import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    NonAttribute,
} from "sequelize"
import {sequelize} from "./db"
import {DBTrainingSession} from "./DBTrainingSession"
import {parseJSONColumn} from "./json"

/** Die Messreihen, so wie sie in der JSON-Spalte liegen. */
export interface TrackChannels {
    power: number[]
    targetPower?: (number | null)[]
    cadence?: (number | null)[]
    heartRate?: (number | null)[]
    speed?: (number | null)[]
}

/**
 * Der Sekundenverlauf einer Einheit.
 *
 * Eigene Tabelle, damit der Verlauf sie nicht mitliest - siehe
 * `V5__session_tracks.sql`. Geladen wird sie nur von `/sessions/:id/track`.
 */
export class DBTrainingSessionTrack extends Model<
    InferAttributes<DBTrainingSessionTrack>,
    InferCreationAttributes<DBTrainingSessionTrack>
> {
    declare sessionID: number
    declare sampleIntervalSeconds: CreationOptional<number>
    declare sampleCount: number
    declare startOffsetSeconds: CreationOptional<number>
    // Logischer Typ. MariaDB liefert JSON-Spalten je nach Server als
    // Zeichenkette - dafür ist `channelList` da.
    declare channels: TrackChannels
    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>

    public get channelList(): NonAttribute<TrackChannels> {
        return parseJSONColumn<TrackChannels>(this.channels, {power: []})
    }

    public toDTO(): RideTrackDTO {
        const channels = this.channelList
        return {
            sampleIntervalSeconds: this.sampleIntervalSeconds,
            sampleCount: this.sampleCount,
            startOffsetSeconds: this.startOffsetSeconds,
            power: channels.power ?? [],
            // Nur die Spalten, die es wirklich gibt: ein Feld voller `null`
            // sagt der Oberfläche etwas anderes als ein fehlendes Feld -
            // nämlich "gemessen, aber leer" statt "nie gemessen".
            ...(channels.targetPower ? {targetPower: channels.targetPower} : {}),
            ...(channels.cadence ? {cadence: channels.cadence} : {}),
            ...(channels.heartRate ? {heartRate: channels.heartRate} : {}),
            ...(channels.speed ? {speed: channels.speed} : {}),
        }
    }
}

DBTrainingSessionTrack.init(
    {
        sessionID: {type: DataTypes.INTEGER, primaryKey: true},
        sampleIntervalSeconds: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 1},
        sampleCount: {type: DataTypes.INTEGER, allowNull: false},
        startOffsetSeconds: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
        channels: {type: DataTypes.JSON, allowNull: false},
        createdAt: DataTypes.DATE,
        updatedAt: DataTypes.DATE,
    },
    {
        sequelize,
        tableName: "trainingSessionTrack",
    }
)

DBTrainingSession.hasOne(DBTrainingSessionTrack, {foreignKey: "sessionID", as: "track"})
DBTrainingSessionTrack.belongsTo(DBTrainingSession, {foreignKey: "sessionID", as: "session"})
