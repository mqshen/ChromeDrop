const $ = query => document.getElementById(query);

function log(text) {
  // $('log').value += text + '\n';
  console.log(text);
}

var du = new DeviceUUID().parse();
    var dua = [ 
      du.language,
      du.platform,
      du.os,
      du.cpuCores,
      du.isAuthoritative,
      du.silkAccelerated,
      du.isKindleFire,
      du.isDesktop,
      du.isMobile,
      du.isTablet,
      du.isWindows,
      du.isLinux,
      du.isLinux64,
      du.isMac,
      du.isiPad,
      du.isiPhone,
      du.isiPod,
      du.isSmartTV,
      du.pixelDepth,
      du.isTouchScreen
    ];
var uuid = du.hashMD5(dua.join(':'));
console.log(uuid);

const url = window.location.href;
const chromedrop = new Chromedrop(location.hostname, location.port, uuid);

