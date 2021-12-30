const $ = query => document.getElementById(query);

function log(text) {
  // $('log').value += text + '\n';
  console.log(text);
}

class ChromdropServer {

  constructor(port) {
      var server = new http.Server();
      this._wss = new http.WebSocketServer(server);
      server.listen( port);

      server.addEventListener('request', function(req) {
        var url = req.headers.url;
        if (url == '/')
          url = '/index.html';
        // Serve the pages of this chrome application.
        req.serveUrl(url);
        return true;
      });

      this._wss.addEventListener('request', (request) => {
        var peerId;
        var cookie = request.headers["Cookie"]
        
        if (cookie) {
            peerId = cookie.split('; ')
                .find(row => row.startsWith('peerid=')).split('=')[1] 
        } 
        if (!peerId || "undefined" == peerId) {
            peerId = NodePeer.uuid();
        }

        var socket = request.accept(peerId);
        this._onConnection(new NodePeer(socket, request, peerId));
        // (new NodePeer(socket, request))
        return true;
      });

      this._rooms = [];

      console.log('ChromeDrop is running on port', port);
  }

  _onConnection(peer) {
      peer.socket.addEventListener('message', message => this._onMessage(peer, message));
      peer.socket.addEventListener('close', message => {
          this._leaveRoom(peer);
      });
      this._keepAlive(peer);

      // send displayName
      this._send(peer, {
          type: 'display-name',
          message: {
              displayName: peer.name.displayName,
              deviceName: peer.name.deviceName,
              peerId: peer.id
          }
      });
      this._joinRoom(peer);
  }

  _onMessage(sender, message) {
      // Try to parse message 
      try {
          message = JSON.parse(message.data);
      } catch (e) {
          return; // TODO: handle malformed JSON
      }

      switch (message.type) {
          case 'disconnect':
              this._leaveRoom(sender);
              break;
          case 'pong':
              sender.lastBeat = Date.now();
              break;
      }

      console.log("receive message", message)

      // relay message to recipient
      if (message.to && this._rooms) {
          const recipientId = message.to; // TODO: sanitize
          const recipient = this._rooms[recipientId];
          delete message.to;
          // add sender id
          message.sender = sender.id;
          this._send(recipient, message);
          return;
      }
  }

  _joinRoom(peer) {
      // if room doesn't exist, create it
      
      // notify all other peers
      for (const otherPeerId in this._rooms) {
          const otherPeer = this._rooms[otherPeerId];
          this._send(otherPeer, {
              type: 'peer-joined',
              peer: peer.getInfo()
          });
      }

      // notify peer about the other peers
      const otherPeers = [];
      for (const otherPeerId in this._rooms) {
          otherPeers.push(this._rooms[otherPeerId].getInfo());
      }

      this._send(peer, {
          type: 'peers',
          peers: otherPeers
      });

      // add peer to room
      this._rooms[peer.id] = peer;
  }

  _leaveRoom(peer) {
      if (!this._rooms[peer.id] ) return;
      this._cancelKeepAlive(this._rooms[peer.id]);

      // delete the peer
      delete this._rooms[peer.id];

      peer.socket.close();//terminate();
      //if room is empty, delete the room
      if (!Object.keys(this._rooms).length) {
          return;
      } else {
          // notify all other peers
          for (const otherPeerId in this._rooms) {
              const otherPeer = this._rooms[otherPeerId];
              this._send(otherPeer, { type: 'peer-left', peerId: peer.id });
          }
      }
  }

  _send(peer, message) {
      if (!peer) return;
      if (this._wss.readyState !== this._wss.OPEN) return;
      message = JSON.stringify(message);
      peer.socket.send(message);
  }

  _keepAlive(peer) {
      this._cancelKeepAlive(peer);
      var timeout = 30000;
      if (!peer.lastBeat) {
          peer.lastBeat = Date.now();
      }
      if (Date.now() - peer.lastBeat > 2 * timeout) {
          this._leaveRoom(peer);
          return;
      }

      this._send(peer, { type: 'ping' });

      peer.timerId = setTimeout(() => this._keepAlive(peer), timeout);
  }

  _cancelKeepAlive(peer) {
      if (peer && peer.timerId) {
          clearTimeout(peer.timerId);
      }
  }
}

class NodePeer {

  constructor(socket, request, peerId) {
      // set socket
      this.socket = socket;
      this.id = peerId;

      this.rtcSupported = request.headers.url.indexOf('webrtc') > -1;
      // set name 
      this._setName(request);
      // for keepalive
      this.timerId = 0;
      this.lastBeat = Date.now();;
      
  }

  _setPeerId(request) {
      if (request.peerId) {
          this.id = request.peerId;
      } else if (request.headers.cookie) {
          this.id = request.headers.cookie.replace('peerid=', '');
      }
  }

  toString() {
      return `<Peer id=${this.id} ip=${this.ip} rtcSupported=${this.rtcSupported}>`
  }

  _setName(req) {
      var userAgent = req.headers['User-Agent'];
      if (!userAgent) {
          userAgent = req.headers['user-agent']
      }
      let ua = UAParser(userAgent);


      let deviceName = '';
      
      if (ua.os && ua.os.name) {
          deviceName = ua.os.name.replace('Mac OS', 'Mac') + ' ';
      }
      
      if (ua.device.model) {
          deviceName += ua.device.model;
      } else {
          deviceName += ua.browser.name;
      }

      if(!deviceName)
          deviceName = 'Unknown Device';

      const displayName = deviceName;

      this.name = {
          model: ua.device.model,
          os: ua.os.name,
          browser: ua.browser.name,
          type: ua.device.type,
          deviceName,
          displayName
      };
  }

  getInfo() {
      return {
          id: this.id,
          name: this.name,
          rtcSupported: this.rtcSupported
      }
  }

  // return uuid of form xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  static uuid() {
      let uuid = '',
          ii;
      for (ii = 0; ii < 32; ii += 1) {
          switch (ii) {
              case 8:
              case 20:
                  uuid += '-';
                  uuid += (Math.random() * 16 | 0).toString(16);
                  break;
              case 12:
                  uuid += '-';
                  uuid += '4';
                  break;
              case 16:
                  uuid += '-';
                  uuid += (Math.random() * 4 | 8).toString(16);
                  break;
              default:
                  uuid += (Math.random() * 16 | 0).toString(16);
          }
      }
      return uuid;
  };
}

Object.defineProperty(String.prototype, 'hashCode', {
value: function() {
  var hash = 0, i, chr;
  for (i = 0; i < this.length; i++) {
    chr   = this.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}
});

var port = 9999;
var isServer = false;
if (http.Server && http.WebSocketServer) {
  const server = new ChromdropServer(port);
  isServer = true;
}


class ServerAddressUI {

    html() {
        return `
        <div role="tabpanel"> 
            <div class="input-group"> 
                <input type="text" class="form-control" value="" readonly="" /> 
                <div class="input-group-button"> 
                    <button>复制</button>
                </div>
            </div>
        </div>`
    }

    constructor(address) {
        var body = document.body.querySelector('#serverInfo');
        if (address.ipv4) {
            body.appendChild(this.generateDom(address.ipv4));
        }
        if (address.ipv6) {
            body.appendChild(this.generateDom(address.ipv6));
        }
    }

    generateDom(address) {
        const el = document.createElement('div');
        el.innerHTML = this.html();
        el.ui = this;
        const url = 'http://' + address + ":" + port + "/share.html";
        el.querySelector('input').value = url;
        el.querySelector('button').addEventListener('click', e => {
            navigator.clipboard.writeText(url).then(function() { 
                Events.fire('notify-user', 'copy success');
              }, function() {
                Events.fire('notify-user', 'copy failed');
              });
        });
        return el;
    }

}

chrome.system.network.getNetworkInterfaces(function(interfaces){
    const toast = new Toast();
    var addresses = {};
    interfaces.forEach(interface => {
        if (!addresses[interface.name]) {
            addresses[interface.name] = {name: interface.name}
        }
        if (interface.prefixLength == 64) {
            addresses[interface.name].ipv6 = interface.address;
        } else {
            addresses[interface.name].ipv4 = interface.address;
        }
    })

    for (let name in addresses) {
        const address = addresses[name]
        if (address.ipv4 && address.ipv6) {
            new ServerAddressUI(address);
        }
    }

    for (let name in addresses) {
        const address = addresses[name]
        if ((address.ipv4 && !address.ipv6) || 
            (!address.ipv4 && address.ipv6)) {
            new ServerAddressUI(address);
        }
    }

});


