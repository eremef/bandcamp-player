const { Bonjour } = require('bonjour-service');
const castv2 = require('castv2');
const selfsigned = require('selfsigned');

console.log('Generating self-signed certificate...');
selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { keySize: 2048, days: 365 })
  .then(pems => {
    const server = new castv2.Server({
      key: pems.private,
      cert: pems.cert
    });

    server.on('message', (clientId, sourceId, destinationId, namespace, data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch (e) {
        return;
      }
      
      if (namespace === 'urn:x-cast:com.google.cast.tp.connection') {
        if (msg.type === 'CONNECT') {
          console.log(`[CastV2] Client connected: ${clientId} (${sourceId} -> ${destinationId})`);
        }
      } else if (namespace === 'urn:x-cast:com.google.cast.tp.heartbeat') {
        if (msg.type === 'PING') {
          server.send(clientId, destinationId, sourceId, namespace, JSON.stringify({ type: 'PONG' }));
        }
      } else if (namespace === 'urn:x-cast:com.google.cast.receiver') {
        if (msg.type === 'GET_STATUS' || msg.type === 'LAUNCH') {
          const statusResponse = {
            requestId: msg.requestId,
            type: 'RECEIVER_STATUS',
            status: {
              applications: [{
                appId: msg.type === 'LAUNCH' ? msg.appId : 'CC1AD845',
                displayName: 'Default Media Receiver',
                namespaces: [
                  { name: 'urn:x-cast:com.google.cast.player.message' },
                  { name: 'urn:x-cast:com.google.cast.media' }
                ],
                sessionId: 'mock-session-1234',
                statusText: 'Ready To Cast',
                transportId: 'web-1'
              }],
              isActiveInput: true,
              volume: { level: 1.0, muted: false, controlType: 'MASTER', stepInterval: 0.05 }
            }
          };
          server.send(clientId, destinationId, sourceId, namespace, JSON.stringify(statusResponse));
          console.log(`[CastV2] Responded to ${msg.type}`);
        }
      } else if (namespace === 'urn:x-cast:com.google.cast.media') {
        if (msg.type === 'LOAD' || msg.type === 'PLAY' || msg.type === 'PAUSE' || msg.type === 'STOP' || msg.type === 'GET_STATUS') {
          const mediaStatusResponse = {
            requestId: msg.requestId || 0,
            type: 'MEDIA_STATUS',
            status: [{
              mediaSessionId: 1,
              playbackRate: 1,
              playerState: msg.type === 'PAUSE' ? 'PAUSED' : (msg.type === 'STOP' ? 'IDLE' : 'PLAYING'),
              currentTime: 0,
              supportedMediaCommands: 15,
              volume: { level: 1.0, muted: false, controlType: 'MASTER', stepInterval: 0.05 }
            }]
          };
          server.send(clientId, destinationId, sourceId, namespace, JSON.stringify(mediaStatusResponse));
          console.log(`[CastV2] Media action: ${msg.type}`);
        }
      }
    });

    server.listen(8009, '0.0.0.0', () => {
      console.log('Mock CastV2 Receiver listening on port 8009');
      
      const bonjour = new Bonjour();
      bonjour.publish({
        name: 'MockCastReceiver',
        type: 'googlecast',
        port: 8009,
        txt: { fn: 'MockCastReceiver', md: 'Mock', id: 'mock-1234' }
      });
      console.log('mDNS service _googlecast._tcp published');
    });
  })
  .catch(console.error);
