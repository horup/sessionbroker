import {ClientMsg, ServerMsg, ISession} from '../shared';
import { ENGINE_METHOD_DIGESTS } from 'constants';
import { SessionState } from 'http2';
export * from '../shared';
export interface Client
{
    id:number;
}
export interface Session extends ISession
{

}
export class MasterClient
{
    private ws:WebSocket;
    private _clientId:number;
    private _connected = false;
    private _avaliableSessions = [] as ISession[]; 
    private _clients = [] as Client[];
    private _currentSession = null as Session;

    get clients()
    {
        return this._clients;
    }

    get currentSession()
    {
        return this._currentSession;
    }

    get clientId()
    {
        return this._clientId;
    }

    get avaliableSessions()
    {
        return this._avaliableSessions;
    }

    get isConnected()
    {
        return this._connected;
    }

    get isSessionOwner():boolean
    {
        return this.isConnected && this.currentSession != null && this.currentSession.owner == this.clientId;
    }

    public connect(url:string)
    {
        this.ws = new WebSocket(url);
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = ()=> {
            this.sendConnect();
        }

        this.ws.onmessage = async (msg)=> {
            const buffer = msg.data as ArrayBuffer;
            const serverMsg = ServerMsg.decode(new Uint8Array(buffer));
            if (serverMsg.welcome)
            {
                this._clientId = serverMsg.welcome.clientId;
                this._connected = true;
                this.onConnectionChange(this.isConnected, this.clientId)
            }
            else if (serverMsg.currentSessionChanged)
            {
                this._currentSession = serverMsg.currentSessionChanged.session;
                this.onSessionChange(this.currentSession)
            }
            else if (serverMsg.avaliableSessionsChanged)
            {
                this._avaliableSessions = serverMsg.avaliableSessionsChanged.sessions;
                this.onSessionsChange(this.avaliableSessions);
            }
            else if (serverMsg.app)
            {
                let te = new TextDecoder();
                let json = te.decode(serverMsg.app.data);
                const o = JSON.parse(json);
                this.onAppMessageFromJson(serverMsg.app.from, o);
            }            

            this.onMessage(serverMsg);
        }

        this.ws.onclose = ()=>{
            this._connected = false;
            this._currentSession = null;
            this.onSessionChange(this._currentSession);
            this.onConnectionChange(this.isConnected, this.clientId);
            setTimeout(()=>{
                this.connect(url);
            }, 5000)
        }

        this.ws.onerror = (e)=>
        {
            this.ws.close();
        }
    }

    
    onAppMessageFromJson = <AppMsg>(fromId:number, app:AppMsg)=>{}
    onConnectionChange = (connected:boolean, clientId:number)=>{}
    onSessionChange = (sesssion?:(Session))=>{};
    onSessionsChange = (sessions:Session[])=>{};
    onClientsChange = (clients:Client[])=>{};

    private sendConnect():boolean
    {
        this.send(new ClientMsg({
            connect:{

            }
        }));


        return true;
    }

    public sendAppMessage(data:Uint8Array, to:number = undefined, loopback:boolean = undefined)
    {
        this.send(new ClientMsg({
            appMsg:{
                data:data,
                loopback:loopback,
                to:to
            }
        }))
    }

    public sendAppMessageAsJson<T>(object:T, to:number = undefined, loopback:boolean = undefined)
    {
        let s = JSON.stringify(object);
        let te = new TextEncoder();
        this.sendAppMessage(te.encode(s), to, loopback);
    }

    public sendCreateSession(name:string, password:string = undefined):boolean
    {
        this.send(new ClientMsg({
            createSession:{
                name:name,
                password:password
            }
        }));

        return true;
    }

    public sendJoinSession(sessionId:number, password?:string)
    {
        this.send(new ClientMsg({
            joinSession:{
                sessionId:sessionId
            }
        }));


        return true;
    }

    onMessage = (serverMsg:ServerMsg)=>{};

    private send(clientMsg:ClientMsg)
    {
        const buffer = ClientMsg.encode(clientMsg).finish();
        this.ws.send(buffer);
    }
}