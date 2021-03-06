import IVersion from '../IVersion'

export default interface IAssemblerOptions {
    padding: number
    exportAllLabels: boolean
    nopAfterHalt: boolean
    optimizeLd: boolean
    debugDefineName: string
    debugDefineValue: string
    version: IVersion
}
