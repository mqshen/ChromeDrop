class Events {
	static fire(type, detail) {
		window.dispatchEvent(new CustomEvent(type, { detail: detail }));
	}

	static on(type, callback) {
		return window.addEventListener(type, callback, false);
	}
}


class Dialog {
	constructor(id) {
		this.$el = $(id);
		this.$el.querySelectorAll('[close]').forEach(el => el.addEventListener('click', e => this.hide()))
		this.$autoFocus = this.$el.querySelector('[autofocus]');
	}

	show() {
		this.$el.setAttribute('show', 1);
		if (this.$autoFocus) this.$autoFocus.focus();
	}

	hide() {
		this.$el.removeAttribute('show');
		document.activeElement.blur();
		window.blur();
	}
}

class ReceiveDialog extends Dialog {

	constructor() {
		super('receiveDialog');
		Events.on('file-received', e => {
			this._nextFile(e.detail);
			window.blop.play();
		});
		this._filesQueue = [];
	}

	_nextFile(nextFile) {
		if (nextFile) this._filesQueue.push(nextFile);
		if (this._busy) return;
		this._busy = true;
		const file = this._filesQueue.shift();
		this._displayFile(file);
	}

	_dequeueFile() {
		if (!this._filesQueue.length) { // nothing to do
			this._busy = false;
			return;
		}
		// dequeue next file
		setTimeout(_ => {
			this._busy = false;
			this._nextFile();
		}, 300);
	}

	_displayFile(file) {
		const $a = this.$el.querySelector('#download');
		const url = URL.createObjectURL(file.blob);
		$a.href = url;
		$a.download = file.name;

		if (this._autoDownload()) {
			$a.click()
			return
		}
		if (file.mime.split('/')[0] === 'image') {
			console.log('the file is image');
			this.$el.querySelector('.preview').style.visibility = 'inherit';
			this.$el.querySelector("#img-preview").src = url;
		}

		this.$el.querySelector('#fileName').textContent = file.name;
		this.$el.querySelector('#fileSize').textContent = this._formatFileSize(file.size);
		this.show();

		if (window.isDownloadSupported) return;
		// fallback for iOS
		$a.target = '_blank';
		const reader = new FileReader();
		reader.onload = e => $a.href = reader.result;
		reader.readAsDataURL(file.blob);
	}

	_formatFileSize(bytes) {
		if (bytes >= 1e9) {
			return (Math.round(bytes / 1e8) / 10) + ' GB';
		} else if (bytes >= 1e6) {
			return (Math.round(bytes / 1e5) / 10) + ' MB';
		} else if (bytes > 1000) {
			return Math.round(bytes / 1000) + ' KB';
		} else {
			return bytes + ' Bytes';
		}
	}

	hide() {
		this.$el.querySelector('.preview').style.visibility = 'hidden';
		this.$el.querySelector("#img-preview").src = "";
		super.hide();
		this._dequeueFile();
	}


	_autoDownload() {
		return !this.$el.querySelector('#autoDownload').checked
	}
}


class SendTextDialog extends Dialog {
	constructor() {
		super('sendTextDialog');
		Events.on('text-recipient', e => this._onRecipient(e.detail))
		this.$text = this.$el.querySelector('#textInput');
		const button = this.$el.querySelector('form');
		button.addEventListener('submit', e => this._send(e));
	}

	_onRecipient(recipient) {
		this._recipient = recipient;
		this._handleShareTargetText();
		this.show();

		const range = document.createRange();
		const sel = window.getSelection();

		range.selectNodeContents(this.$text);
		sel.removeAllRanges();
		sel.addRange(range);

	}

	_handleShareTargetText() {
		if (!window.shareTargetText) return;
		this.$text.textContent = window.shareTargetText;
		window.shareTargetText = '';
	}

	_send(e) {
		e.preventDefault();
		Events.fire('send-text', {
			to: this._recipient,
			text: this.$text.innerText
		});
	}
}

class ReceiveTextDialog extends Dialog {
	constructor() {
		super('receiveTextDialog');
		Events.on('text-received', e => this._onText(e.detail))
		this.$text = this.$el.querySelector('#text');
		const $copy = this.$el.querySelector('#copy');
		copy.addEventListener('click', _ => this._onCopy());
	}

	_onText(e) {
		this.$text.innerHTML = '';
		const text = e.text;
		if (isURL(text)) {
			const $a = document.createElement('a');
			$a.href = text;
			$a.target = '_blank';
			$a.textContent = text;
			this.$text.appendChild($a);
		} else {
			this.$text.textContent = text;
		}
		this.show();
		window.blop.play();
	}

	async _onCopy() {
		await navigator.clipboard.writeText(this.$text.textContent);
		Events.fire('notify-user', 'Copied to clipboard');
	}
}

class Toast extends Dialog {
	constructor() {
		super('toast');
		Events.on('notify-user', e => this._onNotfiy(e.detail));
	}

	_onNotfiy(message) {
		this.$el.textContent = message;
		this.show();
		setTimeout(_ => this.hide(), 3000);
	}
}
