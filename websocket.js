'use strict';
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class WebSocketConnection extends EventEmitter {
  static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
  constructor(socket, head, maxPayload=2*1024*1024){
    super();this.socket=socket;this.readyState=WebSocketConnection.OPEN;this.maxPayload=maxPayload;this.buffer=Buffer.alloc(0);this.fragments=[];this.fragmentOpcode=0;
    socket.on('data',chunk=>this._data(chunk));socket.on('error',e=>this.emit('error',e));socket.on('close',()=>this._closed());socket.on('end',()=>this._closed());
    if(head&&head.length)this._data(head);
  }
  send(value){if(this.readyState!==WebSocketConnection.OPEN)throw new Error('WebSocket is not open');const data=Buffer.isBuffer(value)?value:Buffer.from(String(value));let header;
    if(data.length<126){header=Buffer.alloc(2);header[1]=data.length}
    else if(data.length<=65535){header=Buffer.alloc(4);header[1]=126;header.writeUInt16BE(data.length,2)}
    else{header=Buffer.alloc(10);header[1]=127;header.writeBigUInt64BE(BigInt(data.length),2)}
    header[0]=0x81;this.socket.write(Buffer.concat([header,data]));
  }
  close(code=1000,reason=''){
    if(this.readyState>=WebSocketConnection.CLOSING)return;this.readyState=WebSocketConnection.CLOSING;
    const text=Buffer.from(String(reason).slice(0,120));const payload=Buffer.alloc(2+text.length);payload.writeUInt16BE(code,0);text.copy(payload,2);this._writeControl(8,payload);this.socket.end();
  }
  _writeControl(opcode,payload=Buffer.alloc(0)){const h=Buffer.from([0x80|opcode,payload.length]);this.socket.write(Buffer.concat([h,payload]))}
  _closed(){if(this.readyState===WebSocketConnection.CLOSED)return;this.readyState=WebSocketConnection.CLOSED;this.emit('close')}
  _protocolError(){this.close(1002,'Protocol error')}
  _data(chunk){
    this.buffer=Buffer.concat([this.buffer,chunk]);
    while(this.buffer.length>=2){
      const b0=this.buffer[0],b1=this.buffer[1],fin=!!(b0&0x80),opcode=b0&0x0f,masked=!!(b1&0x80);let len=b1&0x7f,offset=2;
      if(!masked){this._protocolError();return}
      if(len===126){if(this.buffer.length<4)return;len=this.buffer.readUInt16BE(2);offset=4}
      else if(len===127){if(this.buffer.length<10)return;const wide=this.buffer.readBigUInt64BE(2);if(wide>BigInt(this.maxPayload)){this.close(1009,'Message too large');return}len=Number(wide);offset=10}
      if(len>this.maxPayload){this.close(1009,'Message too large');return}
      if(this.buffer.length<offset+4+len)return;
      const mask=this.buffer.subarray(offset,offset+4);offset+=4;const payload=Buffer.from(this.buffer.subarray(offset,offset+len));this.buffer=this.buffer.subarray(offset+len);
      for(let i=0;i<payload.length;i++)payload[i]^=mask[i&3];
      if(opcode===8){this._writeControl(8,payload);this.socket.end();this._closed();return}
      if(opcode===9){this._writeControl(10,payload);continue}
      if(opcode===10)continue;
      if(opcode===1||opcode===2){if(this.fragmentOpcode){this._protocolError();return}if(fin)this.emit('message',payload);else{this.fragmentOpcode=opcode;this.fragments=[payload]}}
      else if(opcode===0){if(!this.fragmentOpcode){this._protocolError();return}this.fragments.push(payload);if(fin){const full=Buffer.concat(this.fragments);this.fragments=[];this.fragmentOpcode=0;this.emit('message',full)}}
      else{this._protocolError();return}
    }
  }
}
class WebSocketServer extends EventEmitter {
  constructor({server,maxPayload=2*1024*1024}={}){super();this.server=server;this.maxPayload=maxPayload;this.clients=new Set();server.on('upgrade',(req,socket,head)=>{
    const key=req.headers['sec-websocket-key'];const version=req.headers['sec-websocket-version'];
    if(!key||version!=='13'||!String(req.headers.upgrade||'').toLowerCase().includes('websocket')){socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');socket.destroy();return}
    const accept=crypto.createHash('sha1').update(key+GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
    const ws=new WebSocketConnection(socket,head,this.maxPayload);this.clients.add(ws);ws.on('close',()=>this.clients.delete(ws));this.emit('connection',ws,req);
  })}
  close(callback){for(const ws of this.clients)ws.close();this.clients.clear();if(callback)callback()}
}
module.exports={WebSocketServer,WebSocket:WebSocketConnection};
