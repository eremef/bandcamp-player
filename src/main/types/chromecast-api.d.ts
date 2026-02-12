declare module 'chromecast-api' {
    import { EventEmitter } from 'events';

    export default class Client extends EventEmitter {
        constructor();
        devices: any[];
        update(): void;
        destroy(): void;
        on(event: 'device', callback: (device: any) => void): this;
    }
}
