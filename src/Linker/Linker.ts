import Lexer from '../Assembler/Lexer'
import Token from '../Assembler/Token'
import TokenType from '../Assembler/TokenType'
import BinarySerializer from '../BinarySerializer'
import Diagnostic from '../Diagnostic'
import Logger from '../Logger'
import ExprType from './ExprType'
import ILinkSection from './ILinkSection'
import IObjectPatch from './IObjectPatch'
import IObjectSection from './IObjectSection'
import IRegionTypeMap from './IRegionTypeMap'
import LinkerContext from './LinkerContext'
import PatchType from './PatchType'
import RegionType from './RegionType'
import SymbolType from './SymbolType'

type LinkExprRule = (values: number[], bs: BinarySerializer, link: ILinkSection, ctx: LinkerContext) => void

export default class Linker {
    public logger: Logger
    public lexer: Lexer

    public exprRules: { [key in ExprType]: LinkExprRule } = {
        [ExprType.add]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a + b)
        },
        [ExprType.subtract]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a - b)
        },
        [ExprType.multiply]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a * b)
        },
        [ExprType.divide]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a / b)
        },
        [ExprType.modulo]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a % b)
        },
        [ExprType.negate]: (values) => {
            const a = values.pop() as number
            values.push(-a)
        },
        [ExprType.bitwise_or]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a | b)
        },
        [ExprType.bitwise_and]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a & b)
        },
        [ExprType.bitwise_xor]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a ^ b)
        },
        [ExprType.bitwise_not]: (values) => {
            const a = values.pop() as number
            values.push(~a)
        },
        [ExprType.and]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a !== 0 && b !== 0 ? 1 : 0)
        },
        [ExprType.or]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a !== 0 || b !== 0 ? 1 : 0)
        },
        [ExprType.not]: (values) => {
            const a = values.pop() as number
            values.push(a === 0 ? 1 : 0)
        },
        [ExprType.equal]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a === b ? 1 : 0)
        },
        [ExprType.not_equal]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a !== b ? 1 : 0)
        },
        [ExprType.greater_than]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a > b ? 1 : 0)
        },
        [ExprType.less_than]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a < b ? 1 : 0)
        },
        [ExprType.greater_or_equal]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a >= b ? 1 : 0)
        },
        [ExprType.less_or_equal]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a <= b ? 1 : 0)
        },
        [ExprType.shift_left]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a << b)
        },
        [ExprType.shift_right]: (values) => {
            const b = values.pop() as number
            const a = values.pop() as number
            values.push(a >>> b)
        },
        [ExprType.bank_id]: (values, bs, link, ctx) => {
            const symbol = link.file.symbols[bs.readLong()]
            const symLink = ctx.linkSections.find((l) => l.section === link.file.sections[symbol.sectionId])
            if (symLink) {
                values.push(symLink.bank)
                return
            } else if (symbol.type === SymbolType.Imported) {
                for (const file of ctx.objectFiles) {
                    const otherSymbol = file.symbols.find((s) => s.type === SymbolType.Exported && s.name === symbol.name)
                    if (otherSymbol) {
                        const otherLink = ctx.linkSections.find((l) => l.section === file.sections[otherSymbol.sectionId])
                        if (otherLink) {
                            values.push(otherLink.bank)
                            return
                        }
                    }
                }
            }
            this.error(`Could not find a definition for symbol "${symbol.name}"`, link.section, ctx)
        },
        [ExprType.bank_section]: (values, bs, link, ctx) => {
            const sectionName = bs.readString()
            const otherLink = ctx.linkSections.find((l) => l.section.name === sectionName)
            if (otherLink) {
                values.push(otherLink.bank)
                return
            }
            this.error(`Could not find a linked section named "${sectionName}"`, link.section, ctx)
        },
        [ExprType.bank_current]: (values, _, link) => {
            values.push(link.bank)
        },
        [ExprType.hram_check]: (values, _, link, ctx) => {
            const a = values.pop() as number
            if (a >= 0xFF00 && a <= 0xFFFF) {
                values.push(a & 0xFF)
            } else {
                this.error('Value must be in HRAM range', link.section, ctx)
            }
        },
        [ExprType.immediate_int]: (values, bs) => {
            values.push(bs.readLong())
        },
        [ExprType.immediate_id]: (values, bs, link, ctx) => {
            const symbol = link.file.symbols[bs.readLong()]
            const symLink = ctx.linkSections.find((l) => l.section === link.file.sections[symbol.sectionId])
            if (symLink) {
                values.push(symLink.start + symbol.value)
                return
            } else if (symbol.type === SymbolType.Imported) {
                for (const file of ctx.objectFiles) {
                    const otherSymbol = file.symbols.find((s) => s.type === SymbolType.Exported && s.name === symbol.name)
                    if (otherSymbol) {
                        const otherLink = ctx.linkSections.find((l) => l.section === file.sections[otherSymbol.sectionId])
                        if (otherLink) {
                            values.push(otherLink.start + otherSymbol.value)
                            return
                        }
                    }
                }
            }
            this.error(`Could not find a definition for symbol "${symbol.name}"`, link.section, ctx)
        }
    }

    constructor(logger: Logger) {
        this.logger = logger
        this.lexer = new Lexer(this.logger)
    }

    public async link(ctx: LinkerContext): Promise<LinkerContext> {
        ctx.regionTypeMap = this.getRegionTypes(ctx)
        ctx.linkSections = []

        const sections = this.getAllSections(ctx)
        let totalBanks = 1

        if (ctx.options.linkerScript) {
            const lines = ctx.options.linkerScript.split(/\r?\n/g)
            let lineNumber = 0

            const addrs: { [key: string]: number } = {}
            let region = RegionType.rom0
            let bank = 0
            let addrKey = ''

            for (const line of lines) {
                const tokens = this.lexer.lexString(line, lineNumber++).filter((t) => t.type !== TokenType.space && t.type !== TokenType.escape && t.type !== TokenType.interp && t.type !== TokenType.comment && t.type !== TokenType.start_of_line && t.type !== TokenType.end_of_line).reverse()
                while (tokens.length) {
                    const token = tokens.pop()
                    if (!token) {
                        break
                    }
                    if (token.type === TokenType.region) {
                        region = RegionType[token.value.toLowerCase() as keyof typeof RegionType]
                        const regionType = ctx.regionTypeMap[region]
                        if (regionType) {
                            bank = this.parseNumberToken(tokens.pop())
                            addrKey = `${region}[${bank}]`
                            addrs[addrKey] = addrs[addrKey] ? addrs[addrKey] : regionType.start
                        }
                    } else if (token.type === TokenType.string) {
                        const section = sections.find((s) => s.name === token.value.substr(1, token.value.length - 2))
                        if (section) {
                            section.address = addrs[addrKey]
                            section.region = region
                            section.bank = bank
                            addrs[addrKey] += section.data ? section.data.length : 0
                        }
                    } else if (token.value.toLowerCase() === 'org') {
                        addrs[addrKey] = this.parseNumberToken(tokens.pop())
                    } else if (token.value.toLowerCase() === 'align') {
                        const alignment = 1 << this.parseNumberToken(tokens.pop())
                        if (alignment > 0 && (addrs[addrKey] % alignment) !== 0) {
                            addrs[addrKey] += alignment - (addrs[addrKey] % alignment)
                        }
                    } else if (token.value.toLowerCase() === 'include') {
                        this.error('Include not yet implemented in linker scripts', undefined, ctx)
                    }
                }
            }
        }

        for (const section of sections) {
            const link = this.allocate(section, ctx)
            if (link) {
                ctx.linkSections.push(link)
                this.logger.log('linkSection', `${RegionType[link.region]}[${link.bank}] ${this.hexString(link.start)} - ${this.hexString(link.end)} = ${link.section.name}`)

                if (link.region === RegionType.rom0 || link.region === RegionType.romx) {
                    totalBanks = Math.max(totalBanks, link.bank + 1)
                }
            }
        }

        if (ctx.options.generateSymbolFile) {
            ctx.symbolFile = this.getSymbolFile(ctx)
        }

        if (ctx.options.generateMapFile) {
            ctx.mapFile = this.getMapFile(ctx)
        }

        const data = new Uint8Array(ctx.options.disableRomBanks ? 0x8000 : totalBanks * 0x4000)
        data.fill(ctx.options.padding)

        for (const link of ctx.linkSections) {
            if (link.region === RegionType.rom0 || link.region === RegionType.romx) {
                this.fillSection(link, new BinarySerializer(data), ctx)

                for (const patch of link.section.patches) {
                    this.fillPatch(patch, link, new BinarySerializer(data), ctx)
                }
            } else if (link.section.patches.length) {
                this.error('Found patches in a region that cannot be patched', link.section, ctx)
            }
        }

        ctx.romFile = data

        return ctx
    }

    public parseNumberToken(t: Token | undefined): number {
        if (t && t.type === TokenType.decimal_number) {
            return parseInt(t.value, 10)
        } else if (t && t.type === TokenType.hex_number) {
            return parseInt(t.value.substr(1), 16)
        } else {
            return 0
        }
    }

    public getRegionTypes(ctx: LinkerContext): IRegionTypeMap {
        return {
            [RegionType.rom0]: ctx.options.disableRomBanks ?
                {
                    start: 0x0000,
                    end: 0x7FFF,
                    banks: 1
                } :
                {
                    start: 0x0000,
                    end: 0x3FFF,
                    banks: 1
                },
            [RegionType.romx]: ctx.options.disableRomBanks ?
                undefined :
                {
                    start: 0x4000,
                    end: 0x7FFF,
                    banks: 512,
                    noBank0: true
                },
            [RegionType.vram]: ctx.options.disableVramBanks ?
                {
                    start: 0x8000,
                    end: 0x9FFF,
                    banks: 1
                } :
                {
                    start: 0x8000,
                    end: 0x9FFF,
                    banks: 2
                },
            [RegionType.sram]: {
                start: 0xA000,
                end: 0xBFFF,
                banks: 16
            },
            [RegionType.wram0]: ctx.options.disableWramBanks ?
                {
                    start: 0xC000,
                    end: 0xDFFF,
                    banks: 1
                } :
                {
                    start: 0xC000,
                    end: 0xCFFF,
                    banks: 1
                },
            [RegionType.wramx]: ctx.options.disableWramBanks ?
                undefined :
                {
                    start: 0xD000,
                    end: 0xDFFF,
                    banks: 8,
                    noBank0: true
                },
            [RegionType.oam]: {
                start: 0xFE00,
                end: 0xFE9F,
                banks: 1
            },
            [RegionType.hram]: {
                start: 0xFF80,
                end: 0xFFFE,
                banks: 1
            }
        }
    }

    public getAllSections(ctx: LinkerContext): IObjectSection[] {
        let sections: IObjectSection[] = []
        for (const file of ctx.objectFiles) {
            for (const section of file.sections) {
                ctx.sectionFileMap[section.name] = file
                sections.push(section)
            }
        }

        sections = sections.filter((section) => {
            const type = ctx.regionTypeMap[section.region]
            if (!type) {
                this.error('Invalid memory region', section, ctx)
            } else if (section.bank >= 0 && type.banks === 1) {
                this.error('Memory region does not support banking', section, ctx)
            } else if (section.bank >= 0 && section.bank >= type.banks) {
                this.error('Bank number is out of range', section, ctx)
            } else if (section.bank === 0 && type.noBank0) {
                this.error('Memory region does not allow bank 0', section, ctx)
            } else if (section.address >= 0 && (section.address < type.start || section.address > type.end)) {
                this.error('Fixed address is outside of the memory region', section, ctx)
            } else {
                return true
            }
            return false
        })

        sections = sections.sort((a, b) => {
            if (a.region !== b.region) {
                return b.region - a.region
            }
            const aHasAddr = a.address >= 0
            const bHasAddr = b.address >= 0
            if (aHasAddr && !bHasAddr) {
                return -1
            } else if (!aHasAddr && bHasAddr) {
                return 1
            } else if (aHasAddr && bHasAddr) {
                return a.address - b.address
            }
            const aHasBank = a.bank >= 0
            const bHasBank = b.bank >= 0
            if (aHasBank && !bHasBank) {
                return -1
            } else if (!aHasBank && bHasBank) {
                return 1
            } else if (aHasBank && bHasBank) {
                return a.bank - b.bank
            }
            const aHasAlign = a.align >= 0
            const bHasAlign = b.align >= 0
            if (aHasAlign && !bHasAlign) {
                return -1
            } else if (!aHasAlign && bHasAlign) {
                return 1
            }
            return a.data.length - b.data.length
        })
        return sections
    }

    public getSymbolFile(ctx: LinkerContext): string {
        const lines: string[] = []
        for (const file of ctx.objectFiles) {
            for (const symbol of file.symbols) {
                if (symbol.type === SymbolType.Imported) {
                    continue
                }
                const link = ctx.linkSections.find((l) => l.section === file.sections[symbol.sectionId])
                if (link) {
                    lines.push(`${this.hexString(link.bank, 2, true)}:${this.hexString(link.start + symbol.value, 4, true)} ${symbol.name}`)
                }
            }
        }
        return lines.sort().join('\r\n')
    }

    public getMapFile(ctx: LinkerContext): string {
        let result: string = ''
        const regionList = [RegionType.rom0, RegionType.romx, RegionType.wram0, RegionType.wramx, RegionType.vram, RegionType.oam, RegionType.hram, RegionType.sram]
        for (const region of regionList) {
            const type = ctx.regionTypeMap[region]
            if (!type) {
                continue
            }
            let lastBank = type.banks - 1
            if (region === RegionType.romx) {
                lastBank = ctx.linkSections.map((l) => l.bank).reduce((p, c) => Math.max(p, c))
            }
            for (let bank = type.noBank0 ? 1 : 0; bank <= lastBank; bank++) {
                if (region === RegionType.rom0) {
                    result += `ROM Bank #${bank} (HOME):\r\n`
                } else if (region === RegionType.romx) {
                    result += `ROM Bank #${bank}:\r\n`
                } else if (region === RegionType.wram0 || region === RegionType.wramx) {
                    result += `WRAM Bank #${bank}:\r\n`
                } else if (region === RegionType.vram) {
                    result += `VRAM Bank #${bank}:\r\n`
                } else if (region === RegionType.oam) {
                    result += `OAM:\r\n`
                } else if (region === RegionType.hram) {
                    result += `HRAM:\r\n`
                } else if (region === RegionType.sram) {
                    result += `SRAM Bank #${bank}:\r\n`
                }

                const links = ctx.linkSections.filter((l) => l.region === region && l.bank === bank).sort((a, b) => a.start - b.start)
                if (links.length > 0) {
                    let size = type.end - type.start + 1
                    for (const link of links) {
                        result += `  SECTION: ${this.hexString(link.start)}-${this.hexString(link.end)} (${this.hexString(link.end - link.start + 1)} bytes) ["${link.section.name}"]\r\n`
                        const symbols = link.file.symbols.filter((s) => link.section === link.file.sections[s.sectionId]).sort((a, b) => a.value - b.value)
                        for (const symbol of symbols) {
                            result += `           ${this.hexString(link.start + symbol.value)} = ${symbol.name}\r\n`
                        }
                        size -= (link.end - link.start + 1)
                    }
                    result += `    SLACK: ${this.hexString(size)} bytes\r\n`
                } else {
                    result += `  EMPTY\r\n`
                }
            }
            result += '\r\n'
        }
        return result
    }

    public calcPatchValue(patch: IObjectPatch, link: ILinkSection, ctx: LinkerContext): number {
        const bs = new BinarySerializer(patch.expr)
        const values: number[] = []

        while (!bs.reachedEnd()) {
            this.exprRules[bs.readByte() as ExprType](values, bs, link, ctx)
        }

        if (values.length !== 1) {
            this.error(`Invalid link expression at ${patch.file} (${patch.line})`, link.section, ctx)
            return 0
        }

        return values[0]
    }

    public fillSection(link: ILinkSection, bs: BinarySerializer, ctx: LinkerContext): void {
        if (link.region !== RegionType.rom0 && link.region !== RegionType.romx) {
            this.error('Tried to fill section in region other than ROM', link.section, ctx)
            return
        }
        const index = 0x4000 * link.bank + link.start - (link.region === RegionType.romx ? 0x4000 : 0x0000)
        this.logger.log('linkPatch', `Filling ${this.hexString(index, 5)} - ${this.hexString(index + link.section.data.length - 1, 5)} = ${link.section.name} `)
        bs.index = index
        bs.writeBytes(link.section.data)
    }

    public fillPatch(patch: IObjectPatch, link: ILinkSection, bs: BinarySerializer, ctx: LinkerContext): void {
        const val = this.calcPatchValue(patch, link, ctx)
        const index = 0x4000 * link.bank + link.start - (link.region === RegionType.romx ? 0x4000 : 0x0000) + patch.offset

        this.logger.log('linkPatch', `Filling ${this.hexString(index)} = ${this.hexString(val)} `)

        bs.index = index
        if (patch.type === PatchType.byte) {
            bs.writeByte(val)
        } else if (patch.type === PatchType.word) {
            bs.writeShort(val)
        } else if (patch.type === PatchType.long) {
            bs.writeLong(val)
        } else if (patch.type === PatchType.jr) {
            bs.writeByte(val - index - 1)
        }
    }

    public allocate(section: IObjectSection, ctx: LinkerContext): ILinkSection | undefined {
        const file = ctx.sectionFileMap[section.name]
        const fixedAddr = section.address >= 0
        const fixedBank = section.bank >= 0
        const alignment = section.align >= 0 ? (1 << section.align) : 0
        const region = section.region
        const type = ctx.regionTypeMap[region]

        if (!type) {
            this.error('Invalid memory region', section, ctx)
            return undefined
        }

        let addr = fixedAddr ? section.address : type.start
        let bank = fixedBank ? section.bank : (type.noBank0 ? 1 : 0)

        if (fixedAddr && fixedBank) {
            return {
                region,
                start: addr,
                end: addr + section.data.length - 1,
                bank,
                section,
                file
            }
        }

        while (true) {
            if (!fixedAddr && alignment > 0 && (addr % alignment) !== 0) {
                addr += alignment - (addr % alignment)
            }
            const overlaps = ctx.linkSections.filter((s) => {
                if (s.bank !== bank || s.region !== region) {
                    return false
                }
                const x0 = addr
                const x1 = addr + section.data.length - 1
                const y0 = s.start
                const y1 = s.end
                return x1 >= y0 && y1 >= x0
            })
            if (overlaps.length) {
                if (!fixedAddr) {
                    addr = overlaps.reduce((p, s) => Math.max(p, s.end), addr) + 1
                    if (alignment > 0 && (addr % alignment) !== 0) {
                        addr += alignment - (addr % alignment)
                    }
                }
                if (addr + section.data.length - 1 > type.end || fixedAddr) {
                    if (bank >= type.banks - 1) {
                        this.error('Not enough room left in any bank', section, ctx)
                        return undefined
                    } else if (fixedBank) {
                        this.error('Not enough room in specified bank', section, ctx)
                        return undefined
                    } else {
                        bank++
                        addr = fixedAddr ? section.address : type.start
                    }
                }
            } else {
                return {
                    region,
                    start: addr,
                    end: addr + section.data.length - 1,
                    bank,
                    section,
                    file
                }
            }
        }
    }

    public error(msg: string, section: IObjectSection | undefined, ctx: LinkerContext): void {
        ctx.diagnostics.push(new Diagnostic('Linker', `${msg} ${section ? ` at section "${section.name}"` : ''} `, 'error'))
    }

    private hexString(n: number, len: number = 4, noSymbol: boolean = false): string {
        return `${n < 0 ? '-' : ''} ${noSymbol ? '' : '$'} ${Math.abs(n).toString(16).toUpperCase().padStart(len, '0')} `
    }
}