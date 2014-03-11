/**
 * gopush-cluster javascript sdk
 */

(function(){

	var getScript = function(options){
		// JSONP
		var callback = 'callback_' + Math.floor(new Date().getTime() * Math.random()).toString(36);
		var head = document.getElementsByTagName("head")[0];
		var script = document.createElement('script');
		options = options || {};
		GoPushCli[callback] = options.success || function(){};
		script.type = 'text/javascript';
		script.charset = 'UTF-8';
		script.onload = script.onreadystatechange = function(_, isAbort){
			if ( isAbort || !script.readyState || /loaded|complete/.test( script.readyState ) ) {
				script.onload = script.onreadystatechange = null;
				head.removeChild(script);
				script = null;
			}
		};
		script.src = options.url + ((/\?/).test(options.url) ? '&' : '?') + 'callback=GoPushCli.' + callback;
		head.insertBefore(script, head.firstChild);
	};

	var parseJSON = function(data){
		if(window.JSON && window.JSON.parse){
			return JSON.parse(data);
		}
		return eval('(' + data + ')');
	};

	var GoPushCli = function(options){
		// Properties
		this.host = options.host;
		this.port = options.port;
		this.key = options.key;
		this.heartbeat = options.heartbeat || 60;
		this.mid = options.mid || 0;
		this.pmid = options.pmid || 0;
		this.proto = window.WebSocket ? 1 : 2;
		// Timers
		this.heartbeatTimer = null;
		this.timeoutTimer = null;
		// Status
		this.isGetNode = false;
		this.isHandshake = false;
		this.isDesotry = false;
		// Events
		this.onOpen = options.onOpen || function(){};
		this.onError = options.onError || function(){};
		this.onClose = options.onClose || function(){};
		this.onOnlineMessage = options.onOnlineMessage || function(){};
		this.onOfflineMessage = options.onOfflineMessage || function(){};
	};

	GoPushCli.prototype.start = function(){
		var that = this;
		getScript({
			url: 'http://' + that.host + ':' + that.port + '/server/get?key=' + that.key + '&proto=' + that.proto,
			success: function(json){
				if(json.ret == 0){
					that.isGetNode = true;
					if(that.proto == 1){
						that.initWebSocket(json.data.server.split(':'));
					}else{
						// TODO Comet
						that.onError('浏览器不支持WebSocket');
					}
				}else{
					that.onError(json.msg);
				}
			}
		});
	};

	GoPushCli.prototype.initWebSocket = function(node){
		var that = this;
		that.ws = new WebSocket('ws://' + node[0] + ':' + parseInt(node[1]) + '/sub?key=' + that.key + '&heartbeat=' + that.heartbeat);
		that.ws.onopen = function(){
			var key = that.key;
			var heartbeatStr = that.heartbeat + '';
			that.getOfflineMessage();
			that.runHeartbeatTask();
			that.onOpen();
		};
		that.ws.onmessage = function(e){
			var data = e.data;
			if(data[0] == '+'){
				clearTimeout(that.timerOutTimer);
				// console.log('Debug: 响应心跳');
			}else if(data[0] == '$'){
				var message;
				try{
					message = parseJSON(data.split('\r\n')[1]);
				}catch(e){
					that.onError('解析返回JSON失败');
					return;
				}
				if(message.gid == 0){
					if(that.mid < message.mid){
						that.mid = message.mid;
					}else{
						return;
					}
				}else{
					if(that.pmid < message.mid){
						that.pmid = message.mid;
					}else{
						return;
					}
				}
				that.onOnlineMessage(message);
			}else if(data[0] == '-'){
				that.onError('握手协议错误' + data);
			}else{
				that.onError('无法识别返回协议' + data);
			}
		};
		that.ws.onclose = function(e){
			that.onClose();
			that.isDesotry = true;
			clearInterval(that.heartbeatTimer);
			clearTimeout(that.timerOutTimer);
		};
	};

	GoPushCli.prototype.runHeartbeatTask = function(){
		var that = this;
		that.heartbeatTimer = setInterval(function(){
			that.send('h');
			that.timerOutTimer = setTimeout(function(){
				that.destory();
				that.onError('心跳超时');
			}, (that.heartbeat + 15) * 1000);
			// console.log('Debug: 请求心跳');
		}, that.heartbeat * 1000);
	};

	GoPushCli.prototype.send = function(data){
		if(this.proto == 1){
			this.ws.send(data);
		}else{
			// Comet TODO
		}
	};

	GoPushCli.prototype.getOfflineMessage = function(){
		var that = this;
		getScript({
			url: 'http://' + that.host + ':' + that.port + '/msg/get?key=' + that.key + '&mid=' + that.mid + '&pmid=' + that.pmid,
			success: function(json){
				if(json.ret == 0){
					var message;
					var data = json.data;
					if(data && data.pmsgs){
						for(var i = 0, l = data.pmsgs.length; i < l; ++i){
							message = parseJSON(data.pmsgs[i]);
							if(that.pmid < message.mid){
								that.onOfflineMessage(message);
								that.pmid = message.mid;
							}
						}
					}
					if(data && data.msgs){
						for(var i = 0, l = data.msgs.length; i < l; ++i){
							message = parseJSON(data.msgs[i]);
							if(that.mid < message.mid){
								that.onOfflineMessage(message);
								that.mid = message.mid;
							}
						}
					}
				}else{
					that.onError(json.msg);
				}
			}
		});
	};

	GoPushCli.prototype.destory = function(){
		this.ws.close();
	};

	window.GoPushCli = GoPushCli;
})();