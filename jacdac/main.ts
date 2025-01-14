//% deprecated
namespace kitronik_air_quality { }

namespace modules {
    /**
     * The air temperature sensor on the Kitronik air quality module
     */
    //% fixedInstance whenUsed block="kitronik temperature"
    export const kitronikTemperature = new TemperatureClient(
        "kitronik temperature?dev=self&variant=Outdoor"
    )

    /**
     * The air pressure sensor on the Kitronik air quality module
     */
    //% fixedInstance whenUsed block="kitronik pressure"
    export const kitronikPressure = new AirPressureClient(
        "kitronik pressure?dev=self"
    )

    /**
     * The air humidity sensor on the Kitronik air quality module
     */
    //% fixedInstance whenUsed block="kitronik humidity"
    export const kitronikHumidity = new HumidityClient(
        "kitronik humidity?dev=self"
    )

    /**
     * The CO2 sensor on the Kitronik air quality module
     */
    //% fixedInstance whenUsed block="kitronik CO2"
    export const kitronikCO2 = new ECO2Client("kitronik CO2?dev=self")

    /**
     * The character screen display on the Kitronik air quality module
     */
    //% fixedInstance whenUsed block="kitronik display"
    export const kitronikDisplay = new CharacterScreenClient(
        "kitronik display?dev=self&rows=8&columns=26&variant=OLED"
    )

    /**
     * The real time clock client on the Kitronik air quality module
     */
    //% fixedInstance whenUsed block="kitronik clock"
    export const kitronikClock = new RealTimeClockClient(
        "kitronik clock?dev=self&variant=Crystal"
    )
}

namespace servers {
    const STREAMING_INTERVAL = 1000

    class CharacterScreenServer extends jacdac.Server {
        textDirection = jacdac.CharacterScreenTextDirection.LeftToRight
        message: string = ""

        constructor() {
            super(jacdac.SRV_CHARACTER_SCREEN, {
                variant: jacdac.CharacterScreenVariant.OLED,
            })
        }

        handlePacket(pkt: jacdac.JDPacket): void {
            this.textDirection = this.handleRegValue(
                pkt,
                jacdac.CharacterScreenReg.TextDirection,
                jacdac.CharacterScreenRegPack.TextDirection,
                this.textDirection
            )
            this.handleRegFormat(pkt, jacdac.CharacterScreenReg.Columns, jacdac.CharacterScreenRegPack.Columns, [26]) // NUMBER_OF_CHAR_PER_LINE
            this.handleRegFormat(pkt, jacdac.CharacterScreenReg.Rows, jacdac.CharacterScreenRegPack.Rows, [8]) // NUMBER_OF_CHAR_PER_LINE

            const oldMessage = this.message
            this.message = this.handleRegValue(
                pkt,
                jacdac.CharacterScreenReg.Message,
                jacdac.CharacterScreenRegPack.Message,
                this.message
            )
            if (this.message != oldMessage) this.syncMessage()
        }

        private syncMessage() {
            if (!this.message) kitronik_air_quality.clear()
            else {
                const lines = this.message.split("\n")
                let i = 0
                for (; i < lines.length; ++i)
                    kitronik_air_quality.show(lines[i], i + 1)
                for (; i < 8; ++i) kitronik_air_quality.show("", i + 1)
            }
        }
    }

    const YEAR_OFFSET = 2000
    class RealTimeClockServer extends jacdac.SensorServer {
        constructor() {
            super(jacdac.SRV_REAL_TIME_CLOCK, {
                variant: jacdac.RealTimeClockVariant.Crystal,
            })
        }

        serializeState() {
            const year = kitronik_air_quality.readDateParameter(
                DateParameter.Year
            )
            const month = kitronik_air_quality.readDateParameter(
                DateParameter.Month
            )
            const dayOfMonth = kitronik_air_quality.readDateParameter(
                DateParameter.Day
            )
            const dayOfWeek = 0
            const hour = kitronik_air_quality.readTimeParameter(
                TimeParameter.Hours
            )
            const min = kitronik_air_quality.readTimeParameter(
                TimeParameter.Minutes
            )
            const sec = kitronik_air_quality.readTimeParameter(
                TimeParameter.Seconds
            )
            return jacdac.jdpack(jacdac.RealTimeClockRegPack.LocalTime, [
                year + YEAR_OFFSET,
                month,
                dayOfMonth,
                dayOfWeek,
                hour,
                min,
                sec,
            ])
        }
        handleCustomCommand(pkt: jacdac.JDPacket): void {
            if (
                pkt.isCommand &&
                pkt.serviceCommand == jacdac.RealTimeClockCmd.SetTime
            ) {
                const [year, month, dayOfMonth, dayOfWeek, hour, min, sec] =
                    pkt.jdunpack<
                        [number, number, number, number, number, number, number]
                    >(jacdac.RealTimeClockCmdPack.SetTime)
                kitronik_air_quality.setDate(
                    dayOfMonth,
                    month,
                    year % YEAR_OFFSET
                )
                kitronik_air_quality.setTime(hour, min, sec)
                console.log(`${dayOfMonth}, ${month}, ${year}`)
            } else pkt.possiblyNotImplemented()
        }
    }

    function createServers() {
        let ready = false
        // start all servers on hardware
        const envServers: jacdac.Server[] = [
            jacdac.createSimpleSensorServer(
                jacdac.SRV_TEMPERATURE,
                jacdac.TemperatureRegPack.Temperature,
                () => kitronik_air_quality.readTemperature(
                    kitronik_air_quality.TemperatureUnitList.C
                ),
                {
                    streamingInterval: STREAMING_INTERVAL,
                    statusCode: jacdac.SystemStatusCodes.Initializing
                }
            ),
            jacdac.createSimpleSensorServer(
                jacdac.SRV_AIR_PRESSURE,
                jacdac.AirPressureRegPack.Pressure,
                () => kitronik_air_quality.readPressure(
                    kitronik_air_quality.PressureUnitList.Pa
                ) / 100,
                {
                    streamingInterval: STREAMING_INTERVAL,
                    statusCode: jacdac.SystemStatusCodes.Initializing
                }
            ),
            jacdac.createSimpleSensorServer(
                jacdac.SRV_HUMIDITY,
                jacdac.HumidityRegPack.Humidity,
                () => kitronik_air_quality.readHumidity(),
                {
                    streamingInterval: STREAMING_INTERVAL,
                    statusCode: jacdac.SystemStatusCodes.Initializing
                }
            ),
            jacdac.createSimpleSensorServer(
                jacdac.SRV_E_CO2,
                jacdac.ECO2RegPack.ECO2,
                () => kitronik_air_quality.readeCO2(),
                {
                    streamingInterval: STREAMING_INTERVAL,
                    statusCode: jacdac.SystemStatusCodes.Initializing,
                    calibrate: () => {
                        if (!ready) return
                        ready = false
                        kitronik_air_quality.calcBaselines()
                        ready = true
                    },
                }
            ),
        ]

        const servers: jacdac.Server[] = 
            [new CharacterScreenServer() as jacdac.Server]
            .concat(envServers)
            .concat([new RealTimeClockServer()])

        control.runInBackground(() => {
            kitronik_air_quality.bme688Init()
            kitronik_air_quality.setupGasSensor()
            kitronik_air_quality.measureData()
            ready = true
            // notify user that the system is booting up
            for (const serv of envServers)
                serv.setStatusCode(jacdac.SystemStatusCodes.Ready)
            // keep polling
            while (true) {
                pause(STREAMING_INTERVAL)
                if (ready) // gas is calibrating
                    kitronik_air_quality.measureData()
            }
        })
        return servers
    }

    function start() {
        jacdac.productIdentifier = 0x32e72267
        jacdac.deviceDescription = "Kitronik Air Quality"
        jacdac.startSelfServers(() => createServers())
    }
    start()
}
