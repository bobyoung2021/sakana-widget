declare module 'sakana-widget' {
    interface Character {
        image: string
        initialState: {
            i: number
            s: number
            d: number
            r: number
            y: number
            t: number
            w: number
        }
    }

    interface SakanaWidgetOptions {
        character?: string
        autoFit?: boolean
        controls?: boolean
        draggable?: boolean
        rod?: boolean
        size?: number
        stroke?: {
            color: string
            width: number
        }
    }

    interface SakanaWidgetState {
        r?: number
        y?: number
        t?: number
        w?: number
        d?: number
    }

    class SakanaWidget {
        constructor(options?: SakanaWidgetOptions)

        static getCharacter(name: string): Character
        static registerCharacter(name: string, character: Character): void

        setState(state: SakanaWidgetState): SakanaWidget
        mount(el: HTMLElement | string): SakanaWidget
        unmount(): void
        setCharacter(name: string): void

        _state: SakanaWidgetState
        _running: boolean
        _run: () => void
    }

    export default SakanaWidget
}

declare module 'sakana-widget/lib/index.css'
