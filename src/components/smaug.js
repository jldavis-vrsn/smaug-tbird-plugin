/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public
 * License Version 1.1 (the "MPL"); you may not use this file
 * except in compliance with the MPL. You may obtain a copy of
 * the MPL at http://www.mozilla.org/MPL/
 *
 * Software distributed under the MPL is distributed on an "AS
 * IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 * implied. See the MPL for the specific language governing
 * rights and limitations under the MPL.
 *
 * The Original Code is Enigmail.
 *
 * The Initial Developer of the Original Code is Ramalingam Saravanan.
 * Portions created by Ramalingam Saravanan <svn@xmlterm.org> are
 * Copyright (C) 2001 Ramalingam Saravanan. All Rights Reserved.
 *
 * Contributor(s):
 * Patrick Brunschwig <patrick@enigmail.net>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * ***** END LICENSE BLOCK ***** */


Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/AddonManager.jsm");
Components.utils.import("resource://smaug/subprocess.jsm");
Components.utils.import("resource://smaug/pipeConsole.jsm");
Components.utils.import("resource://smaug/gpgAgentHandler.jsm");
Components.utils.import("resource://gre/modules/ctypes.jsm");

const gDummyPKCS7 = 'Content-Type: multipart/mixed;\r\n boundary="------------060503030402050102040303\r\n\r\nThis is a multi-part message in MIME format.\r\n--------------060503030402050102040303\r\nContent-Type: application/x-pkcs7-mime\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\r\n--------------060503030402050102040303\r\nContent-Type: application/x-smaug-dummy\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\r\n--------------060503030402050102040303--\r\n';

/* Implementations supplied by this module */
const NS_SMAUG_CONTRACTID   = "@mozdev.org/smaug/smaug;1";

const NS_SMAUGPROTOCOLHANDLER_CONTRACTID =
    "@mozilla.org/network/protocol;1?name=smaug";

const NS_SMAUG_CID =
  Components.ID("{847b3a01-7ab1-11d4-8f02-006008948af5}");

const NS_SMAUGPROTOCOLHANDLER_CID =
  Components.ID("{847b3a11-7ab1-11d4-8f02-006008948af5}");

const NS_SMGCLINE_SERVICE_CID =
  Components.ID("{847b3ab1-7ab1-11d4-8f02-006008948af5}");

// <EMO>
const SMAUG_EXTENSION_ID = "{847b3a00-7ab1-11d4-8f02-999999999999}";
// </EMO>

// Contract IDs and CIDs used by this module
const NS_SIMPLEURI_CONTRACTID   = "@mozilla.org/network/simple-uri;1";
const NS_OBSERVERSERVICE_CONTRACTID = "@mozilla.org/observer-service;1";
const ASS_CONTRACTID = "@mozilla.org/appshell/appShellService;1";
const WMEDIATOR_CONTRACTID = "@mozilla.org/appshell/window-mediator;1";
const NS_IOSERVICE_CONTRACTID       = "@mozilla.org/network/io-service;1";
const NS_SCRIPTABLEINPUTSTREAM_CONTRACTID = "@mozilla.org/scriptableinputstream;1";
const NS_DOMPARSER_CONTRACTID = "@mozilla.org/xmlextras/domparser;1";
const NS_DOMSERIALIZER_CONTRACTID = "@mozilla.org/xmlextras/xmlserializer;1";
const NS_CLINE_SERVICE_CONTRACTID = "@mozilla.org/smaug/cline-handler;1";
const NS_XPCOM_APPINFO = "@mozilla.org/xre/app-info;1";
const DIR_SERV_CONTRACTID  = "@mozilla.org/file/directory_service;1";

const Cc = Components.classes;
const Ci = Components.interfaces;

// Interfaces
const nsISupports            = Ci.nsISupports;
const nsIObserver            = Ci.nsIObserver;
const nsIProtocolHandler     = Ci.nsIProtocolHandler;
const nsIEnvironment         = Ci.nsIEnvironment;
const nsIEnigmail            = Ci.nsIEnigmail;
const nsICmdLineHandler      = Ci.nsICmdLineHandler;
const nsIWindowWatcher       = Ci.nsIWindowWatcher;
const nsICommandLineHandler  = Ci.nsICommandLineHandler;
const nsIWindowsRegKey       = Ci.nsIWindowsRegKey;
const nsIFactory             = Ci.nsIFactory;

const NS_XPCOM_SHUTDOWN_OBSERVER_ID = "xpcom-shutdown";

var Ec = null;

///////////////////////////////////////////////////////////////////////////////
// Global variables

var gLogLevel = 3;            // Output only errors/warnings by default

var gSmaugSvc = null;      // Global Smaug Service

// GPG status flags mapping (see doc/DETAILS file in the GnuPG distribution)
var gStatusFlags = {GOODSIG:         nsIEnigmail.GOOD_SIGNATURE,
                    BADSIG:          nsIEnigmail.BAD_SIGNATURE,
                    ERRSIG:          nsIEnigmail.UNVERIFIED_SIGNATURE,
                    EXPSIG:          nsIEnigmail.EXPIRED_SIGNATURE,
                    REVKEYSIG:       nsIEnigmail.GOOD_SIGNATURE,
                    EXPKEYSIG:       nsIEnigmail.EXPIRED_KEY_SIGNATURE,
                    KEYEXPIRED:      nsIEnigmail.EXPIRED_KEY,
                    KEYREVOKED:      nsIEnigmail.REVOKED_KEY,
                    NO_PUBKEY:       nsIEnigmail.NO_PUBKEY,
                    NO_SECKEY:       nsIEnigmail.NO_SECKEY,
                    IMPORTED:        nsIEnigmail.IMPORTED_KEY,
                    INV_RECP:        nsIEnigmail.INVALID_RECIPIENT,
                    MISSING_PASSPHRASE: nsIEnigmail.MISSING_PASSPHRASE,
                    BAD_PASSPHRASE:  nsIEnigmail.BAD_PASSPHRASE,
                    BADARMOR:        nsIEnigmail.BAD_ARMOR,
                    NODATA:          nsIEnigmail.NODATA,
                    ERROR:           nsIEnigmail.BAD_SIGNATURE | nsIEnigmail.DECRYPTION_FAILED,
                    DECRYPTION_FAILED: nsIEnigmail.DECRYPTION_FAILED,
                    DECRYPTION_OKAY: nsIEnigmail.DECRYPTION_OKAY,
                    TRUST_UNDEFINED: nsIEnigmail.UNTRUSTED_IDENTITY,
                    TRUST_NEVER:     nsIEnigmail.UNTRUSTED_IDENTITY,
                    TRUST_MARGINAL:  nsIEnigmail.UNTRUSTED_IDENTITY,
                    TRUST_FULLY:     nsIEnigmail.TRUSTED_IDENTITY,
                    TRUST_ULTIMATE:  nsIEnigmail.TRUSTED_IDENTITY,
                    CARDCTRL:        nsIEnigmail.CARDCTRL,
                    SC_OP_FAILURE:   nsIEnigmail.SC_OP_FAILURE,
                    UNKNOWN_ALGO:    nsIEnigmail.UNKNOWN_ALGO,
                    SIG_CREATED:     nsIEnigmail.SIG_CREATED,
                    END_ENCRYPTION:  nsIEnigmail.END_ENCRYPTION,
                    INV_SGNR:        0x100000000,
};


// <EMO>
var Libsmaug = {
  lib: null,

  init: function() {
    try
      {
	  try {
	      /* Mac OS X */
	      libsmaug = ctypes.open("libsmaug.dylib");
	  } catch (e) {
	      /* Linux */
	      libsmaug = ctypes.open("libsmaug.so");
	      
	  }

      // declare functions
      prime = libsmaug.declare("smg_init",
                               ctypes.default_abi,
                               ctypes.int,
                               ctypes.char.ptr,
                               ctypes.char.ptr,
                               ctypes.char.ptr);


      encrypt = libsmaug.declare("smg_encrypt",
                                 ctypes.default_abi,
                               ctypes.int,
                                 ctypes.char.ptr,
                                 ctypes.char.ptr,
                                 ctypes.char.ptr.ptr);

      decrypt = libsmaug.declare("smg_decrypt",
                                 ctypes.default_abi,
                               ctypes.int,
                                 ctypes.char.ptr,
                                 ctypes.char.ptr,
                                 ctypes.char.ptr.ptr);
      sign = libsmaug.declare("smg_sign",
                              ctypes.default_abi,
                               ctypes.int,
                              ctypes.char.ptr,
                              ctypes.char.ptr,
                              ctypes.char.ptr.ptr);

      verify = libsmaug.declare("smg_verify",
                                 ctypes.default_abi,
                                 ctypes.int,
                                 ctypes.char.ptr,
                                 ctypes.char.ptr);

      lookup_rr = libsmaug.declare("smg_lookup",
                               ctypes.default_abi,
                               ctypes.int,
                               ctypes.char.ptr,
                               ctypes.int);

    }
    catch (e)
    {
      Ec.ERROR_LOG("smaug.js: Smaug.initialize: unable to init libsmaug\n");
    }
  },

  prime: function(emailAddr, certPath, log) {
           return prime(emailAddr, certPath, log);
  },

  encrypt: function(emailRecipient, emailBody, cipherText) {
             return encrypt(emailRecipient, emailBody, cipherText);
  },

  decrypt: function(emailRecipient, emailBody, clearText) {
             return decrypt(emailRecipient, emailBody, clearText);
  },


  sign: function(emailRecipient, emailBody, signedText) {
             return sign(emailRecipient, emailBody, signedText);
  },

  verify: function(emailRecipient, emailBody) {
             return verify(emailRecipient, emailBody);
  },

  lookup_rr: function(emailRecipient, encr) {
            return lookup_rr(emailRecipient, encr);
  },

  //need to close the library once we're finished with it
  close: function() {
             lib.close();
  }
}
// </EMO>


///////////////////////////////////////////////////////////////////////////////
// File read/write operations

const NS_LOCAL_FILE_CONTRACTID = "@mozilla.org/file/local;1";

const NS_LOCALFILEOUTPUTSTREAM_CONTRACTID =
                              "@mozilla.org/network/file-output-stream;1";

const NS_RDONLY      = 0x01;
const NS_WRONLY      = 0x02;
const NS_CREATE_FILE = 0x08;
const NS_TRUNCATE    = 0x20;
const DEFAULT_FILE_PERMS = 0x180; // equals 0600

const ENC_TYPE_ATTACH_BINARY = 1;
const ENC_TYPE_ATTACH_ASCII = 2;

const DUMMY_AGENT_INFO = "none";

var gKeyAlgorithms = [];

// Read the contents of a file into a string

function readFile(filePath) {

// @filePath: nsIFile

  if (filePath.exists()) {

    var ioServ = Cc[NS_IOSERVICE_CONTRACTID].getService(Ci.nsIIOService);
    if (!ioServ)
      throw Components.results.NS_ERROR_FAILURE;

    var fileURI = ioServ.newFileURI(filePath);
    var fileChannel = ioServ.newChannel(fileURI.asciiSpec, null, null);

    var rawInStream = fileChannel.open();

    var scriptableInStream = Cc[NS_SCRIPTABLEINPUTSTREAM_CONTRACTID].createInstance(Ci.nsIScriptableInputStream);
    scriptableInStream.init(rawInStream);
    var available = scriptableInStream.available();
    var fileContents = scriptableInStream.read(available);
    scriptableInStream.close();
    return fileContents;
  }
  return "";
}


///////////////////////////////////////////////////////////////////////////////

// path initialization function
// uses persistentDescriptor in case that initWithPath fails
// (seems to happen frequently with UTF-8 characters in path names)
function initPath(localFileObj, pathStr) {
  localFileObj.initWithPath(pathStr);

  if (! localFileObj.exists()) {
    localFileObj.persistentDescriptor = pathStr;
  }
}


// return the useable path (for gpg) of a file object
function getFilePath (nsFileObj, creationMode) {
  if (creationMode == null) creationMode = NS_RDONLY;

  return nsFileObj.path;
}


///////////////////////////////////////////////////////////////////////////////
// Utility functions
///////////////////////////////////////////////////////////////////////////////


// get a Windows registry value (string)
// @ keyPath: the path of the registry (e.g. Software\\GNU\\GnuPG)
// @ keyName: the name of the key to get (e.g. InstallDir)
// @ rootKey: HKLM, HKCU, etc. (according to constants in nsIWindowsRegKey)
function getWinRegistryString(keyPath, keyName, rootKey) {
  var registry = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);

  var retval = "";
  try {
    registry.open(rootKey, keyPath, registry.ACCESS_READ);
    retval = registry.readStringValue(keyName);
    registry.close();
  }
  catch (ex) {}

  return retval;
}

function getUnicodeData(data) {
  // convert output from subprocess to Unicode

  var tmpStream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
  tmpStream.setData(data, data.length);
  var inStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
  inStream.init(tmpStream);
  return inStream.read(tmpStream.available());
}


function ExtractMessageId(uri) {
  var messageId = "";

  var matches = uri.match(/^smaug:message\/(.+)/);

  if (matches && (matches.length > 1)) {
    messageId = matches[1];
  }

  return messageId;
}

///////////////////////////////////////////////////////////////////////////////
// Smaug protocol handler
///////////////////////////////////////////////////////////////////////////////

function SmaugProtocolHandler()
{
}

SmaugProtocolHandler.prototype = {

  classDescription: "Smaug Protocol Handler",
  classID:          NS_SMAUGPROTOCOLHANDLER_CID,
  contractID:       NS_SMAUGPROTOCOLHANDLER_CONTRACTID,
  scheme:           "smaug",
  defaultPort:      -1,
  protocolFlags:    nsIProtocolHandler.URI_INHERITS_SECURITY_CONTEXT |
                    nsIProtocolHandler.URI_LOADABLE_BY_ANYONE |
                    nsIProtocolHandler.URI_NORELATIVE |
                    nsIProtocolHandler.URI_NOAUTH |
                    nsIProtocolHandler.URI_OPENING_EXECUTES_SCRIPT,

  QueryInterface: XPCOMUtils.generateQI([nsIProtocolHandler]),

  newURI: function (aSpec, originCharset, aBaseURI) {
    Ec.DEBUG_LOG("smaug.js: SmaugProtocolHandler.newURI: aSpec='"+aSpec+"'\n");

    // cut of any parameters potentially added to the URI; these cannot be handled
    if (aSpec.substr(0,14) == "smaug:dummy") aSpec = "smaug:dummy";

    var uri = Cc[NS_SIMPLEURI_CONTRACTID].createInstance(Ci.nsIURI);
    uri.spec = aSpec;

    return uri;
  },

  newChannel: function (aURI) {
    Ec.DEBUG_LOG("smaug.js: SmaugProtocolHandler.newChannel: URI='"+aURI.spec+"'\n");

    var messageId = ExtractMessageId(aURI.spec);

    if (messageId) {
      // Handle smaug:message/...

      if (!gSmaugSvc)
        throw Components.results.NS_ERROR_FAILURE;

      var contentType, contentCharset, contentData;

      if (gSmaugSvc._messageIdList[messageId]) {
        var messageUriObj = gSmaugSvc._messageIdList[messageId];

        contentType    = messageUriObj.contentType;
        contentCharset = messageUriObj.contentCharset;
        contentData    = messageUriObj.contentData;

        Ec.DEBUG_LOG("smaug.js: SmaugProtocolHandler.newChannel: messageURL="+messageUriObj.originalUrl+", content length="+contentData.length+", "+contentType+", "+contentCharset+"\n");

        // do NOT delete the messageUriObj now from the list, this will be done once the message is unloaded (fix for bug 9730).

      } else {

        contentType = "text/plain";
        contentCharset = "";
        contentData = "Smaug error: invalid URI "+aURI.spec;
      }

      var channel =Ec.newStringChannel(aURI, contentType, "UTF-8", contentData);

      return channel;
    }

    if (aURI.spec == aURI.scheme+":dummy") {
      // Dummy PKCS7 content (to access mimeEncryptedClass)
      channel = Ec.newStringChannel(aURI, "message/rfc822", "", gDummyPKCS7);
      return channel;
    }

    var winName, spec;
    if (aURI.spec == "about:"+aURI.scheme) {
      // About Smaug
      winName = "about:"+smaug;
      spec = "chrome://smaug/content/smaugAbout.xul";

    } else if (aURI.spec == aURI.scheme+":console") {
      // Display smaug console messages
      winName = "smaug:console";
      spec = "chrome://smaug/content/smaugConsole.xul";

    } else if (aURI.spec == aURI.scheme+":keygen") {
      // Display smaug key generation console
      winName = "smaug:keygen";
      spec = "chrome://smaug/content/smaugKeygen.xul";

    } else {
      // Display Smaug about page
      winName = "about:smaug";
      spec = "chrome://smaug/content/smaugAbout.xul";
    }

    var windowManager = Cc[WMEDIATOR_CONTRACTID].getService(Ci.nsIWindowMediator);

    var winEnum=windowManager.getEnumerator(null);
    var recentWin=null;
    while (winEnum.hasMoreElements() && ! recentWin) {
      var thisWin = winEnum.getNext();
      if (thisWin.location.href==spec) {
        recentWin = thisWin;
      }
    }

    if (recentWin) {
      recentWin.focus();
    } else {
      var appShellSvc = Cc[ASS_CONTRACTID].getService(Ci.nsIAppShellService);
      var domWin = appShellSvc.hiddenDOMWindow;

      domWin.open(spec, "_blank", "chrome,menubar,toolbar,resizable");
    }

    throw Components.results.NS_ERROR_FAILURE;
  },

  allowPort: function (port, scheme) {
    // non-standard ports are not allowed
    return false;
  }
};


///////////////////////////////////////////////////////////////////////////////
// Smaug encryption/decryption service
///////////////////////////////////////////////////////////////////////////////


// Locates STRing in TEXT occurring only at the beginning of a line
function IndexOfArmorDelimiter(text, str, offset) {
  //Ec.DEBUG_LOG("smaug.js: IndexOfArmorDelimiter: "+str+", "+offset+"\n");

  while (offset < text.length) {

    var loc = text.indexOf(str, offset);

    if ((loc < 1) || (text.charAt(loc-1) == "\n"))
      return loc;

    offset = loc + str.length;
  }

  return -1;
}


function Smaug()
{
  Components.utils.import("resource://smaug/smaugCommon.jsm");
  Components.utils.import("resource://smaug/commonFuncs.jsm");
  Ec = SmaugCommon;
  SmaugGpgAgent.setSmaugCommon(Ec);

}

Smaug.prototype = {

  classDescription: "Smaug",
  classID:  NS_SMAUG_CID,
  contractID: NS_SMAUG_CONTRACTID,

  initialized: false,
  initializationAttempted: false,
  initializationError: "",
  logFileStream: null,

  isWin32  : false,

  prefBranch: null,
  keygenProcess: null,  // TODO: remove me
  keygenConsole: null,

  // <EMO>
  libsmaug: null,
  // </EMO>

  agentType: "",
  agentPath: null,
  connGpgAgentPath: null,
  gpgconfPath: null,
  agentVersion: "",
  gpgAgentProcess: null,
  userIdList: null,
  rulesList: null,
  gpgAgentInfo: {preStarted: false, envStr: ""},

  _messageIdList: {},
  _xpcom_factory: {
    createInstance: function (aOuter, iid) {
      // Smaug is a service -> only instanciate once
      if (gSmaugSvc == null) {
        gSmaugSvc = new Smaug();
      }
      return gSmaugSvc;
    },
    lockFactory: function (lock) {}
  },
  QueryInterface: XPCOMUtils.generateQI([ nsIEnigmail, nsIObserver, nsISupports ]),


  observe: function (aSubject, aTopic, aData) {
    Ec.DEBUG_LOG("smaug.js: Smaug.observe: topic='"+aTopic+"' \n");

    if (aTopic == NS_XPCOM_SHUTDOWN_OBSERVER_ID) {
      // XPCOM shutdown
      this.finalize();

    }
    else {
      Ec.DEBUG_LOG("smaug.js: Smaug.observe: no handler for '"+aTopic+"'\n");
    }
  },

  getLogDirectoryPrefix: function () {
    var logDirectory = "";
    try {
      logDirectory = this.prefBranch.getCharPref("logDirectory");
    } catch (ex) {
    }

    if (!logDirectory)
      return "";

    var dirPrefix = logDirectory + (Ec.isDosLike() ? "\\" : "/");

    return dirPrefix;
  },


  finalize: function () {
    Ec.DEBUG_LOG("smaug.js: Smaug.finalize:\n");
    if (!this.initialized) return;

    if (this.gpgAgentProcess != null) {
      Ec.DEBUG_LOG("smaug.js: Smaug.finalize: stopping gpg-agent PID="+this.gpgAgentProcess+"\n");
      try {
        var libName=subprocess.getPlatformValue(0);
        var libc = ctypes.open(libName);

        //int kill(pid_t pid, int sig);
        var kill = libc.declare("kill",
                              ctypes.default_abi,
                              ctypes.int,
                              ctypes.int32_t,
                              ctypes.int);

        kill(parseInt(this.gpgAgentProcess), 15);
      }
      catch (ex) {
        Ec.ERROR_LOG("smaug.js: Smaug.finalize ERROR: "+ex+"\n");
      }
    }

    if (this.logFileStream) {
      this.logFileStream.close();
      this.logFileStream = null;
    }

    gLogLevel = 3;
    this.initializationError = "";
    this.initializationAttempted = false;
    this.initialized = false;
  },


  initialize: function (domWindow, version, prefBranch) {
    this.initializationAttempted = true;

    this.prefBranch = prefBranch;

    Ec.DEBUG_LOG("smaug.js: Smaug.initialize: START\n");
    if (this.initialized) return;

    var ioServ = Cc[NS_IOSERVICE_CONTRACTID].getService(Ci.nsIIOService);

    try {
      var httpHandler = ioServ.getProtocolHandler("http");
      httpHandler = httpHandler.QueryInterface(Ci.nsIHttpProtocolHandler);
    }
    catch (ex) {
      httpHandler = domWindow.navigator;
    }

    this.oscpu = httpHandler.oscpu;

    this.platform = httpHandler.platform;

    if (httpHandler.vendor) {
      this.vendor = httpHandler.vendor;
    } else {
      this.vendor = "Mozilla";
    }

    this.isWin32 = (Ec.getOS() == "WINNT");


    var prefix = this.getLogDirectoryPrefix();
    if (prefix) {
      gLogLevel = 5;
      this.logFileStream = SmaugFuncs.createFileStream(prefix+"smgdbug.txt");
      Ec.DEBUG_LOG("smaug.js: Logging debug output to "+prefix+"smgdbug.txt\n");
    }

    Ec.initialize(this, gLogLevel);
    this.version = version;

    Ec.DEBUG_LOG("smaug.js: Smaug version "+this.version+"\n");
    Ec.DEBUG_LOG("smaug.js: OS/CPU="+this.oscpu+"\n");
    Ec.DEBUG_LOG("smaug.js: Platform="+this.platform+"\n");

    var environment;
    try {
      environment = Cc["@mozilla.org/process/environment;1"].getService(nsIEnvironment);

    } catch (ex) {
      this.initializationError = Ec.getString("smgmimeNotAvail");
      Ec.ERROR_LOG("smaug.js: Smaug.initialize: Error - "+this.initializationError+"\n");
      Ec.DEBUG_LOG("smaug.js: Smaug.initialize: exception="+ex.toString()+"\n");
      throw Components.results.NS_ERROR_FAILURE;
    }

    this.environment = environment;

    var nspr_log_modules = environment.get("NSPR_LOG_MODULES");
    var matches = nspr_log_modules.match(/smaug:(\d+)/);

    if (matches && (matches.length > 1)) {
      gLogLevel = matches[1];
      Ec.WARNING_LOG("smaug.js: Smaug: gLogLevel="+gLogLevel+"\n");
    }

    subprocess.registerLogHandler(function(txt) { Ec.ERROR_LOG("subprocess.jsm: "+txt); });

    matches = nspr_log_modules.match(/subprocess:(\d+)/);
    if (matches && (matches.length > 1)) {
      if (matches[1] > 2) subprocess.registerDebugHandler(function(txt) { Ec.DEBUG_LOG("subprocess.jsm: "+txt); });
    }


    // Initialize global environment variables list
    var passEnv = [ "GNUPGHOME", "GPGDIR", "ETC",
                    "ALLUSERSPROFILE", "APPDATA", "BEGINLIBPATH",
                    "COMMONPROGRAMFILES", "COMSPEC", "DISPLAY",
                    "SMAUG_PASS_ENV", "ENDLIBPATH",
                    "HOME", "HOMEDRIVE", "HOMEPATH",
                    "LANG", "LANGUAGE", "LC_ALL", "LC_COLLATE",  "LC_CTYPE",
                    "LC_MESSAGES",  "LC_MONETARY", "LC_NUMERIC", "LC_TIME",
                    "LOCPATH", "LOGNAME", "LD_LIBRARY_PATH", "MOZILLA_FIVE_HOME",
                    "NLSPATH", "PATH", "PATHEXT", "PROGRAMFILES", "PWD",
                    "SHELL", "SYSTEMDRIVE", "SYSTEMROOT",
                    "TEMP", "TMP", "TMPDIR", "TZ", "TZDIR", "UNIXROOT",
                    "USER", "USERPROFILE", "WINDIR" ];

    var passList = this.environment.get("SMAUG_PASS_ENV");
    if (passList) {
      var passNames = passList.split(":");
      for (var k=0; k<passNames.length; k++)
        passEnv.push(passNames[k]);
    }

    Ec.envList = [];
    for (var j=0; j<passEnv.length; j++) {
      var envName = passEnv[j];
      var envValue = this.environment.get(envName);
      if (envValue)
         Ec.envList.push(envName+"="+envValue);
    }

    Ec.DEBUG_LOG("smaug.js: Smaug.initialize: Ec.envList = "+Ec.envList+"\n");

    try {
      SmaugConsole.write("Initializing Smaug service ...\n");

    } catch (ex) {
      this.initializationError = Ec.getString("smgmimeNotAvail");
      Ec.ERROR_LOG("smaug.js: Smaug.initialize: Error - "+this.initializationError+"\n");
      Ec.DEBUG_LOG("smaug.js: Smaug.initialize: exception="+ex.toString()+"\n");
      throw Components.results.NS_ERROR_FAILURE;
    }

    // <EMO>
    /*
    this.setAgentPath(domWindow);

    this.detectGpgAgent(domWindow);

    if (this.useGpgAgent() && (! Ec.isDosLike())) {
      if (this.gpgAgentInfo.envStr != DUMMY_AGENT_INFO)
        Ec.envList.push("GPG_AGENT_INFO="+this.gpgAgentInfo.envStr);
    }
    */

    Ec.ERROR_LOG("smaug.js: Smaug.initialize: Setting libsmaug\n");
    this.libsmaug = Libsmaug;
    Ec.ERROR_LOG("smaug.js: Smaug.initialize: initializing libsmaug\n");
    this.libsmaug.init();
    Ec.ERROR_LOG("smaug.js: Smaug.initialize: initialized\n");

    var certFile = this.prefBranch.getCharPref("smaugSmimeCertPath");
    Ec.ERROR_LOG("smaug.js: Smaug.initialize: Got cert file branch\n");
    if (certFile)
    {
      Ec.DEBUG_LOG("smaug.js: Smaug.initialize: found cert file, initializing from '"+certFile+"'\n");
      var logFile = "";
      var prefix = this.getLogDirectoryPrefix();
      if (prefix)
      {
        logFile = prefix + "smauglog.out";
      }
      ret = this.libsmaug.prime("local@local", certFile, logFile);
      if (!ret)
      {
        Ec.ERROR_LOG("smaug.js: Smaug.initialize: Unable to init libsmaug with certFile='"+certFile+"' and logFile='"+logFile+"'\n");
      }
    }
    // </EMO>

    // Register to observe XPCOM shutdown
    var obsServ = Cc[NS_OBSERVERSERVICE_CONTRACTID].getService();
    obsServ = obsServ.QueryInterface(Ci.nsIObserverService);

    obsServ.addObserver(this, NS_XPCOM_SHUTDOWN_OBSERVER_ID, false);

    Ec.stillActive();
    this.initialized = true;

    Ec.DEBUG_LOG("smaug.js: Smaug.initialize: END\n");
  },

  useGpgAgent: function() {
    var useAgent = false;

    try {
      if (Ec.isDosLike() && this.agentVersion < "2.0") {
        useAgent = false;
      }
      else {
        // gpg version >= 2.0.16 launches gpg-agent automatically
        if (this.agentVersion >= "2.0.16") {
          useAgent = true;
          Ec.DEBUG_LOG("smaug.js: Setting useAgent to "+useAgent+" for gpg2 >= 2.0.16\n");
        }
        else {
          useAgent = (this.gpgAgentInfo.envStr.length>0 || this.prefBranch.getBoolPref("useGpgAgent"));
        }
      }
    }
    catch (ex) {}
    return useAgent;
  },


  reinitialize: function () {
    this.initialized = false;
    this.initializationAttempted = true;

    SmaugConsole.write("Reinitializing Smaug service ...\n");
    this.setAgentPath();
    this.initialized = true;
  },


  determineGpgHomeDir: function () {

    var homeDir = "";

    homeDir = this.environment.get("GNUPGHOME");

    if (! homeDir && this.isWin32) {
      homeDir=getWinRegistryString("Software\\GNU\\GNUPG", "HomeDir", nsIWindowsRegKey.ROOT_KEY_CURRENT_USER);

      if (! homeDir) {
        homeDir = this.environment.get("USERPROFILE");

        if (! homeDir) {
          homeDir = this.environment.get("SystemRoot");
        }

        if (homeDir) homeDir += "\\Application Data\\GnuPG";
      }

      if (! homeDir) homeDir = "C:\\gnupg";
    }

    if (! homeDir) homeDir = this.environment.get("HOME")+"/.gnupg";

    return homeDir;
  },


  setAgentPath: function (domWindow) {
    var agentPath = "";
    try {
      agentPath = this.prefBranch.getCharPref("agentPath");
    } catch (ex) {}

    var agentType = "gpg";

    var agentName = "";

    SmaugGpgAgent.resetGpgAgent();

    if (Ec.isDosLike()) {
      agentName = "gpg.exe";
    }
    else {
      agentName = "gpg;gpg2;gpg1";
    }


    if (agentPath) {
      // Locate GnuPG executable

      // Append default .exe extension for DOS-Like systems, if needed
      if (Ec.isDosLike() && (agentPath.search(/\.\w+$/) < 0))
        agentPath += ".exe";

      try {
        var pathDir = Cc[NS_LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);

        if (! SmaugGpgAgent.isAbsolutePath(agentPath, Ec.isDosLike())) {
          // path relative to Mozilla installation dir
          var ds = Cc[DIR_SERV_CONTRACTID].getService();
          var dsprops = ds.QueryInterface(Ci.nsIProperties);
          pathDir = dsprops.get("CurProcD", Ci.nsIFile);

          var dirs=agentPath.split(RegExp(Ec.isDosLike() ? "\\\\" : "/"));
          for (var i=0; i< dirs.length; i++) {
            if (dirs[i]!=".") {
              pathDir.append(dirs[i]);
            }
          }
          pathDir.normalize();
        }
        else {
          // absolute path
          initPath(pathDir, agentPath);
        }
        if (! (pathDir.isFile() /* && pathDir.isExecutable()*/))
          throw Components.results.NS_ERROR_FAILURE;
        agentPath = pathDir.QueryInterface(Ci.nsIFile);

      } catch (ex) {
        this.initializationError = Ec.getString("gpgNotFound", [ agentPath ]);
        Ec.ERROR_LOG("smaug.js: Smaug.initialize: Error - "+this.initializationError+"\n");
        throw Components.results.NS_ERROR_FAILURE;
      }

    } else {
      // Resolve relative path using PATH environment variable
      var envPath = this.environment.get("PATH");

      agentPath = SmaugGpgAgent.resolvePath(agentName, envPath, Ec.isDosLike());

      if (!agentPath && Ec.isDosLike()) {
        // DOS-like systems: search for GPG in c:\gnupg, c:\gnupg\bin, d:\gnupg, d:\gnupg\bin
        var gpgPath = "c:\\gnupg;c:\\gnupg\\bin;d:\\gnupg;d:\\gnupg\\bin";
        agentPath = SmaugGpgAgent.resolvePath(agentName, gpgPath, Ec.isDosLike());
      }

      if ((! agentPath) && this.isWin32) {
        // Look up in Windows Registry
        try {
          gpgPath = getWinRegistryString("Software\\GNU\\GNUPG", "Install Directory", nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE);
          agentPath = SmaugGpgAgent.resolvePath(agentName, gpgPath, Ec.isDosLike());
        }
        catch (ex) {}

        if (! agentPath) {
          gpgPath = gpgPath + "\\pub";
          agentPath = SmaugGpgAgent.resolvePath(agentName, gpgPath, Ec.isDosLike());
        }
      }

      if (!agentPath && !Ec.isDosLike()) {
        // Unix-like systems: check /usr/bin and /usr/local/bin
        gpgPath = "/usr/bin:/usr/local/bin";
        agentPath = SmaugGpgAgent.resolvePath(agentName, gpgPath, Ec.isDosLike());
      }

      if (!agentPath) {
        this.initializationError = Ec.getString("gpgNotInPath");
        Ec.ERROR_LOG("smaug.js: Smaug: Error - "+this.initializationError+"\n");
        throw Components.results.NS_ERROR_FAILURE;
      }
      agentPath = agentPath.QueryInterface(Ci.nsIFile);
    }

    Ec.CONSOLE_LOG("SmaugAgentPath="+Ec.getFilePathDesc(agentPath)+"\n\n");

    this.agentType = agentType;
    this.agentPath = agentPath;

    var command = agentPath;
    var args = [];
    if (agentType == "gpg") {
       args = [ "--version", "--version", "--batch", "--no-tty", "--charset", "utf-8", "--display-charset", "utf-8" ];
    }

    var exitCode = -1;
    var outStr = "";
    var errStr = "";
    Ec.DEBUG_LOG("smaug.js: Smaug.setAgentPath: calling subprocess with '"+command.path+"'\n");

    var proc = {
      command:     command,
      arguments:   args,
      environment: Ec.envList,
      charset: null,
      done: function(result) {
        exitCode = result.exitCode;
        outStr = result.stdout;
        errStr = result.stderr;
      },
      mergeStderr: false
    };

    try {
      subprocess.call(proc).wait();
    } catch (ex) {
      Ec.ERROR_LOG("smaug.js: Smaug.setAgentPath: subprocess.call failed with '"+ex.toString()+"'\n");
      throw ex;
    }

    Ec.CONSOLE_LOG("smaug> "+Ec.printCmdLine(command, args)+"\n");

    if (exitCode != 0) {
      Ec.ERROR_LOG("smaug.js: Smaug.setAgentPath: gpg failed with exitCode "+exitCode+" msg='"+outStr+" "+errStr+"'\n");
      throw Components.results.NS_ERROR_FAILURE;
    }

    Ec.CONSOLE_LOG(outStr+"\n");

    // detection for Gpg4Win wrapper
    if (outStr.search(/^gpgwrap.*;/) == 0) {
      var outLines = outStr.split(/[\n\r]+/);
      var firstLine = outLines[0];
      outLines.splice(0,1);
      outStr = outLines.join("\n");
      agentPath = firstLine.replace(/^.*;[ \t]*/, "");

      Ec.CONSOLE_LOG("gpg4win-gpgwrapper detected; SmaugAgentPath="+agentPath+"\n\n");
    }

    var versionParts = outStr.replace(/[\r\n].*/g,"").replace(/ *\(gpg4win.*\)/i, "").split(/ /);
    var gpgVersion = versionParts[versionParts.length-1];

    Ec.DEBUG_LOG("smaug.js: detected GnuPG version '"+gpgVersion+"'\n");
    this.agentVersion = gpgVersion;

    // check GnuPG version number
    var evalVersion = this.agentVersion.match(/^\d+\.\d+/);
    if (evalVersion && evalVersion[0]< "1.4") {
      if (domWindow) Ec.alert(domWindow, Ec.getString("oldGpgVersion", [ gpgVersion ]));
      throw Components.results.NS_ERROR_FAILURE;
    }

    this.gpgconfPath = this.resolveToolPath("gpgconf");
    this.connGpgAgentPath = this.resolveToolPath("gpg-connect-agent");

    Ec.DEBUG_LOG("smaug.js: Smaug.setAgentPath: gpgconf found: "+ (this.gpgconfPath ? "yes" : "no") +"\n");

  },

  // resolve the path for GnuPG helper tools
  resolveToolPath: function(fileName) {
    var filePath = Cc[NS_LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);

    if (Ec.isDosLike()) {
      fileName += ".exe";
    }

    filePath = gSmaugSvc.agentPath.clone();

    filePath.normalize(); // resolve symlinks; remove . / .. etc.

    if (filePath) filePath = filePath.parent;
    if (filePath) {
      filePath.append(fileName);
      if (filePath.exists()) {
        filePath.normalize();
        return filePath;
      }
    }

    var foundPath = SmaugGpgAgent.resolvePath(fileName, gSmaugSvc.environment.get("PATH"), Ec.isDosLike());
    if (foundPath != null) { foundPath.normalize(); }
    return foundPath;
  },

  detectGpgAgent: function (domWindow) {
    Ec.DEBUG_LOG("smaug.js: detectGpgAgent\n");

    function extractAgentInfo(fullStr) {
      if (fullStr) {
        fullStr = fullStr.replace(/[\r\n]/g, "");
        fullStr = fullStr.replace(/^.*\=/,"");
        fullStr = fullStr.replace(/\;.*$/,"");
        return fullStr;
      }
      else
        return "";
    }

    var gpgAgentInfo = this.environment.get("GPG_AGENT_INFO");
    if (gpgAgentInfo && gpgAgentInfo.length>0) {
      Ec.DEBUG_LOG("smaug.js: detectGpgAgent: GPG_AGENT_INFO variable available\n");
      // env. variable suggests running gpg-agent
      this.gpgAgentInfo.preStarted = true;
      this.gpgAgentInfo.envStr = gpgAgentInfo;
      Ec.gpgAgentIsOptional = false;
    }
    else {
      Ec.DEBUG_LOG("smaug.js: detectGpgAgent: no GPG_AGENT_INFO variable set\n");
      this.gpgAgentInfo.preStarted = false;

      if (this.agentVersion >= "2.0") {
        Ec.gpgAgentIsOptional = false;
        if (this.agentVersion >= "2.0.16") {
          Ec.DEBUG_LOG("smaug.js: detectGpgAgent: gpg 2.0.16 or newer - not starting agent\n");
        }
        else {
          var command = null;

          var outStr = "";
          var errorStr = "";
          var exitCode = -1;

          if (this.connGpgAgentPath && this.connGpgAgentPath.isExecutable()) {
            // try to connect to a running gpg-agent

            Ec.DEBUG_LOG("smaug.js: detectGpgAgent: gpg-connect-agent is executable\n");

            this.gpgAgentInfo.envStr = DUMMY_AGENT_INFO;

            command = this.connGpgAgentPath.QueryInterface(Ci.nsIFile);

            Ec.CONSOLE_LOG("smaug> "+command.path+"\n");

            try {
              subprocess.call({
                command: command,
                environment: Ec.envList,
                stdin: "/echo OK\n",
                charset: null,
                done: function(result) {
                  Ec.DEBUG_LOG("detectGpgAgent detection terminated with "+result.exitCode+"\n");
                  exitCode = result.exitCode;
                  outStr = result.stdout;
                  errorStr = result.stderr;
                  if (result.stdout.substr(0,2) == "OK") exitCode = 0;
                },
                mergeStderr: false
              }).wait();
            } catch (ex) {
              Ec.ERROR_LOG("smaug.js: detectGpgAgent: "+command.path+" failed\n");
              exitCode = -1;
            }

            if (exitCode == 0) {
              Ec.DEBUG_LOG("smaug.js: detectGpgAgent: found running gpg-agent\n");
              return;
            }
            else {
              Ec.DEBUG_LOG("smaug.js: detectGpgAgent: no running gpg-agent. Output='"+outStr+"' error text='"+errorStr+"'\n");
            }

          }

          // and finally try to start gpg-agent
          var args = [];
          var commandFile = this.resolveToolPath("gpg-agent");
          var agentProcess = null;

          if ((! commandFile) || (! commandFile.exists())) {
            commandFile = this.resolveToolPath("gpg-agent2");
          }

          if (commandFile  && commandFile.exists()) {
            command = commandFile.QueryInterface(Ci.nsIFile);
          }

          if (command == null) {
            Ec.ERROR_LOG("smaug.js: detectGpgAgent: gpg-agent not found\n");
            Ec.alert(domWindow, Ec.getString("gpgAgentNotStarted", [ this.agentVersion ]));
            throw Components.results.NS_ERROR_FAILURE;
          }
        }

        if ((! Ec.isDosLike()) && (this.agentVersion < "2.0.16" )) {

          // create unique tmp file
          var ds = Cc[DIR_SERV_CONTRACTID].getService();
          var dsprops = ds.QueryInterface(Ci.nsIProperties);
          var tmpFile = dsprops.get("TmpD", Ci.nsIFile);
          tmpFile.append("gpg-wrapper.tmp");
          tmpFile.createUnique(tmpFile.NORMAL_FILE_TYPE, DEFAULT_FILE_PERMS);
          args = [ command.path,
                   tmpFile.path,
                  "--sh", "--no-use-standard-socket",
                  "--daemon",
                  "--default-cache-ttl", (Ec.getMaxIdleMinutes()*60).toString(),
                  "--max-cache-ttl", "999999" ];  // ca. 11 days

          try {
            var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
            var exec = Ec.getInstallLocation().clone();
            exec.append("wrappers");
            exec.append("gpg-agent-wrapper.sh");
            process.init(exec);
            process.run(true, args, args.length);

            if (! tmpFile.exists()) {
              Ec.ERROR_LOG("smaug.js: detectGpgAgent no temp file created\n");
            }
            else {
              outStr = readFile(tmpFile);
              tmpFile.remove(false);
              exitCode = 0;
            }
          } catch (ex) {
            Ec.ERROR_LOG("smaug.js: detectGpgAgent: failed with '"+ex+"'\n");
            exitCode = -1;
          }

          if (exitCode == 0) {
            this.gpgAgentInfo.envStr = extractAgentInfo(outStr);
            Ec.DEBUG_LOG("smaug.js: detectGpgAgent: started -> "+this.gpgAgentInfo.envStr+"\n");
            this.gpgAgentProcess = this.gpgAgentInfo.envStr.split(":")[1];
          }
          else {
            Ec.ERROR_LOG("smaug.js: detectGpgAgent: gpg-agent output: "+outStr+"\n");
            Ec.alert(domWindow, Ec.getString("gpgAgentNotStarted", [ this.agentVersion ]));
            throw Components.results.NS_ERROR_FAILURE;
          }
        }
        else {
          this.gpgAgentInfo.envStr = DUMMY_AGENT_INFO;
          var envFile = Components.classes[NS_LOCAL_FILE_CONTRACTID].createInstance(Ci.nsIFile);
          initPath(envFile, this.determineGpgHomeDir());
          envFile.append("gpg-agent.conf");

          var data="default-cache-ttl " + (Ec.getMaxIdleMinutes()*60)+"\n";
          data += "max-cache-ttl 999999";
          if (! envFile.exists()) {
            try {
              var flags = 0x02 | 0x08 | 0x20;
              var fileOutStream = Cc[NS_LOCALFILEOUTPUTSTREAM_CONTRACTID].createInstance(Ci.nsIFileOutputStream);
              fileOutStream.init(envFile, flags, 0600, 0);
              fileOutStream.write(data, data.length);
              fileOutStream.flush();
              fileOutStream.close();
            }
            catch (ex) {} // ignore file write errors
          }
        }
      }
      else {
        Ec.DEBUG_LOG("smaug.js: detectGpgAgent - gpg 1.x found\n");
      }
    }
    Ec.DEBUG_LOG("smaug.js: detectGpgAgent: GPG_AGENT_INFO='"+this.gpgAgentInfo.envStr+"'\n");
  },


  simpleExecCmd: function (command, args, exitCodeObj, errorMsgObj) {
    Ec.WRITE_LOG("smaug.js: Smaug.simpleExecCmd: command = "+command+" "+args.join(" ")+"\n");

    var envList = [];
    envList = envList.concat(Ec.envList);

    var prefix = this.getLogDirectoryPrefix();
    if (prefix && (gLogLevel >= 4)) {

      SmaugFuncs.writeFileContents(prefix+"smgcmd.txt", Ec.printCmdLine(command, args)+"\n");
      SmaugFuncs.writeFileContents(prefix+"smgenv.txt", envList.join(",")+"\n");

      Ec.DEBUG_LOG("smaug.js: Smaug.simpleExecCmd: copied command line/env/input to files "+prefix+"smgcmd.txt/smgenv.txt/smginp.txt\n");
    }

    var outputData = "";
    var errOutput  = "";

    Ec.CONSOLE_LOG("smaug> "+Ec.printCmdLine(command, args)+"\n");

    try {
      subprocess.call({
        command: command,
        arguments: args,
        charset: null,
        environment: envList,
        done: function(result) {
          exitCodeObj.value = result.exitCode;
          outputData = result.stdout;
          errOutput = result.stderr;
        },
        mergeStderr: false
      }).wait();
    } catch (ex) {
      Ec.ERROR_LOG("smaug.js: simpleExecCmd: "+command.path+" failed\n");
      exitCodeObj.value = -1;
    }

    if (errOutput)
       errorMsgObj.value  = errOutput;

    if (prefix && (gLogLevel >= 4)) {
      SmaugFuncs.writeFileContents(prefix+"smgout.txt", outputData);
      SmaugFuncs.writeFileContents(prefix+"smgerr.txt", errOutput);
      Ec.DEBUG_LOG("smaug.js: Smaug.simpleExecCmd: copied command out/err data to files "+prefix+"smgout.txt/smgerr.txt\n");
    }

    Ec.DEBUG_LOG("smaug.js: Smaug.simpleExecCmd: exitCode = "+exitCodeObj.value+"\n");
    Ec.DEBUG_LOG("smaug.js: Smaug.simpleExecCmd: errOutput = "+errOutput+"\n");

    Ec.stillActive();

    return outputData;
  },

  execCmd: function (command, args, passphrase, input, exitCodeObj, statusFlagsObj,
            statusMsgObj, errorMsgObj) {
    Ec.WRITE_LOG("smaug.js: Smaug.execCmd: subprocess = '"+command.path+"'\n");

    if ((typeof input) != "string") input = "";
    var prependPassphrase = ((typeof passphrase) == "string");

    var envList = [];
    envList = envList.concat(Ec.envList);

    var preInput;

    if (prependPassphrase) {
      preInput = passphrase;
      input = "\n" + input;

    } else {
      preInput = "";
    }

    var prefix = this.getLogDirectoryPrefix();
    if (prefix && (gLogLevel >= 4)) {

      if (prependPassphrase) {
        // Obscure passphrase
        SmaugFuncs.writeFileContents(prefix+"smginp.txt", "<passphrase>"+input);
      } else {
        SmaugFuncs.writeFileContents(prefix+"smginp.txt", input);
      }

      SmaugFuncs.writeFileContents(prefix+"smgcmd.txt", Ec.printCmdLine(command, args)+"\n");
      SmaugFuncs.writeFileContents(prefix+"smgenv.txt", envList.join(",")+"\n");

      Ec.DEBUG_LOG("smaug.js: Smaug.execCmd: copied command line/env/input to files "+prefix+"smgcmd.txt/smgenv.txt/smginp.txt\n");
    }

    if (input.length == 0 && preInput.length == 0)

    Ec.CONSOLE_LOG("smaug> "+Ec.printCmdLine(command, args)+"\n");

    var proc = {
      command:     command,
      arguments:   args,
      environment: envList,
      charset: null,
      stdin: function(pipe) {
        if (input.length > 0 || preInput.length > 0) {
          pipe.write(preInput + input);
        }
        pipe.close();
      },
      done: function(result) {
        this.exitCode = result.exitCode;
        this.resultData = result.stdout;
        this.errorData = result.stderr;
      },
      mergeStderr: false,
      resultData: "",
      errorData: "",
      exitCode: -1
    };

    try {
      subprocess.call(proc).wait();
      exitCodeObj.value = proc.exitCode;

    } catch (ex) {
      Ec.ERROR_LOG("smaug.js: Smaug.execCmd: subprocess.call failed with '"+ex.toString()+"'\n");
      exitCodeObj.value = -1;
    }

    var outputData = "";
    var errOutput  = "";

    if (proc.resultData) outputData = proc.resultData;
    if (proc.errorData) errOutput  = proc.errorData;

    if (prefix && (gLogLevel >= 4)) {
      SmaugFuncs.writeFileContents(prefix+"smgout.txt", outputData);
      SmaugFuncs.writeFileContents(prefix+"smgerr.txt", errOutput);
      Ec.DEBUG_LOG("smaug.js: Smaug.execCmd: copied command out/err data to files "+prefix+"smgout.txt/smgerr.txt\n");
    }

    Ec.DEBUG_LOG("smaug.js: Smaug.execCmd: exitCode = "+exitCodeObj.value+"\n");
    Ec.DEBUG_LOG("smaug.js: Smaug.execCmd: errOutput = "+errOutput+"\n");

    var retObj = {};

    errorMsgObj.value = Ec.parseErrorOutput(errOutput, retObj);
    statusFlagsObj.value = retObj.statusFlags;
    statusMsgObj.value = retObj.statusMsg;
    var blockSeparation = retObj.blockSeparation;

    exitCodeObj.value = Ec.fixExitCode(proc.exitCode, statusFlagsObj.value);

    if (blockSeparation.indexOf(" ") > 0) {
      exitCodeObj.value = 2;
    }

    Ec.CONSOLE_LOG(errorMsgObj.value+"\n");

    Ec.stillActive();

    return outputData;
  },


  // <EMO>
  smgEncryptMessage: function (parent, 
                               plainText, 
                               fromMailAddr, 
                               toMailAddr, 
                               bccMailAddr, 
                               sendFlags,
                               exitCodeObj, 
                               errorMsgObj)
  {
    Ec.DEBUG_LOG("smaug.js: Smaug.smgEncryptMessage: "+plainText.length+" bytes from "+fromMailAddr+" to "+toMailAddr+"\n");

    var ret = "";
    exitCodeObj.value    = -1;
    errorMsgObj.value    = "";

    if (!plainText) {
      Ec.DEBUG_LOG("smaug.js: Smaug.smgEncryptMessage: NO ENCRYPTION!\n");
      exitCodeObj.value = 0;
      ret = plainText;
    }
    else if (!this.initialized) {
      Ec.ERROR_LOG("smaug.js: Smaug.smgEncryptMessage: not yet initialized\n");
      errorMsgObj.value = Ec.getString("notInit");
    }
    else
    {
      var defaultSend = sendFlags & nsIEnigmail.SEND_DEFAULT;
      var signMsg     = sendFlags & nsIEnigmail.SEND_SIGNED;
      var encryptMsg  = sendFlags & nsIEnigmail.SEND_ENCRYPTED;

      // First convert all linebreaks to newlines
      plainText = plainText.replace(/\r\n/g, "\n");
      plainText = plainText.replace(/\r/g,   "\n");

      // we need all data in CRLF according to RFC 4880
      plainText = plainText.replace(/\n/g, "\r\n");

      Ec.DEBUG_LOG("smaug.js: SmaugsmgEencryptMessage: plainText='"+plainText+"', "+plainText.length+" bytes\n"); 
      let ptr = new ctypes.char.ptr();

      // If we're told to sign, try it.
      var success = (signMsg) ? this.libsmaug.sign("local@local", plainText, ptr.address()) : 1;

      if (0 == success)
      {
        Ec.ERROR_LOG("smaug.js: Smaug.smgEncryptMessage: no signed data returned.\n");
      }
      else
      {
        var signed = (signMsg) ? ptr.readString() : plainText;
        ptr = new ctypes.char.ptr();

        // If we were told to encypt, try it
        success = (encryptMsg) ? this.libsmaug.encrypt(toMailAddr, signed, ptr.address()) : 1;
        if (0 == success)
        {
          Ec.ERROR_LOG("smaug.js: Smaug.smgEncryptMessage: no encrypted data returned.\n");
        }
        else
        {
          ret = (encryptMsg) ? ptr.readString() : signed;
          // ret = getUnicodeData(ret);
          exitCodeObj.value = 0;
        }
      }
    }
    return ret;
  },
  // </EMO>

  encryptMessage: function (parent, uiFlags, plainText, fromMailAddr, toMailAddr, bccMailAddr, sendFlags,
                            exitCodeObj, statusFlagsObj, errorMsgObj)
  {
    Ec.DEBUG_LOG("smaug.js: Smaug.encryptMessage: "+plainText.length+" bytes from "+fromMailAddr+" to "+toMailAddr+" ("+sendFlags+")\n");

    exitCodeObj.value    = -1;
    statusFlagsObj.value = 0;
    errorMsgObj.value    = "";

    if (!plainText) {
      Ec.DEBUG_LOG("smaug.js: Smaug.encryptMessage: NO ENCRYPTION!\n");
      exitCodeObj.value = 0;
      return plainText;
    }

    if (!this.initialized) {
      Ec.ERROR_LOG("smaug.js: Smaug.encryptMessage: not yet initialized\n");
      errorMsgObj.value = Ec.getString("notInit");
      return "";
    }

    var defaultSend = sendFlags & nsIEnigmail.SEND_DEFAULT;
    var signMsg     = sendFlags & nsIEnigmail.SEND_SIGNED;
    var encryptMsg  = sendFlags & nsIEnigmail.SEND_ENCRYPTED;

    if (encryptMsg) {
      // First convert all linebreaks to newlines
      plainText = plainText.replace(/\r\n/g, "\n");
      plainText = plainText.replace(/\r/g,   "\n");

      // we need all data in CRLF according to RFC 4880
      plainText = plainText.replace(/\n/g, "\r\n");
    }

    var listener = Ec.newSimpleListener(
      function _stdin (pipe) {
        pipe.write(plainText);
        pipe.close();
      });


    var proc = Ec.encryptMessageStart(parent, uiFlags,
                                      fromMailAddr, toMailAddr, bccMailAddr,
                                      null, sendFlags,
                                      listener, statusFlagsObj, errorMsgObj);
    if (! proc) {
      exitCodeObj.value = -1;
      return "";
    }

    // Wait for child STDOUT to close
    proc.wait();

    var retStatusObj = {};
    exitCodeObj.value = Ec.encryptMessageEnd(getUnicodeData(listener.stderrData), listener.exitCode,
                                             uiFlags, sendFlags,
                                             listener.stdoutData.length,
                                             retStatusObj);

    statusFlagsObj.value = retStatusObj.statusFlags;
    errorMsgObj.value = retStatusObj.errorMsg;


    if ((exitCodeObj.value == 0) && listener.stdoutData.length == 0)
      exitCodeObj.value = -1;

    if (exitCodeObj.value == 0) {
      // Normal return
      return getUnicodeData(listener.stdoutData);
    }

    // Error processing
    Ec.DEBUG_LOG("smaug.js: Smaug.encryptMessage: command execution exit code: "+exitCodeObj.value+"\n");
    return "";
  },


  // Locates offsets bracketing PGP armored block in text,
  // starting from given offset, and returns block type string.
  // beginIndex = offset of first character of block
  // endIndex = offset of last character of block (newline)
  // If block is not found, the null string is returned;

  locateArmoredBlock: function (text, offset, indentStr, beginIndexObj, endIndexObj,
            indentStrObj) {
    Ec.DEBUG_LOG("smaug.js: Smaug.locateArmoredBlock: "+offset+", '"+indentStr+"'\n");

    beginIndexObj.value = -1;
    endIndexObj.value = -1;

    var beginIndex = IndexOfArmorDelimiter(text, indentStr+"-----BEGIN PGP ", offset);

    if (beginIndex == -1) {
      var blockStart=text.indexOf("-----BEGIN PGP ");
      if (blockStart>=0) {
        var indentStart=text.search(/\n.*\-\-\-\-\-BEGIN PGP /)+1;
        indentStrObj.value=text.substring(indentStart, blockStart);
        indentStr=indentStrObj.value;
        beginIndex = IndexOfArmorDelimiter(text, indentStr+"-----BEGIN PGP ", offset);
      }
    }

    if (beginIndex == -1)
      return "";

    // Locate newline at end of armor header
    offset = text.indexOf("\n", beginIndex);

    if (offset == -1)
      return "";

    var endIndex = IndexOfArmorDelimiter(text, indentStr+"-----END PGP ", offset);

    if (endIndex == -1)
      return "";

    // Locate newline at end of PGP block
    endIndex = text.indexOf("\n", endIndex);

    if (endIndex == -1) {
      // No terminating newline
      endIndex = text.length - 1;
    }

    var blockHeader = text.substr(beginIndex, offset-beginIndex+1);

    var blockRegex = new RegExp("^" + indentStr +
                                "-----BEGIN PGP (.*)-----\\s*\\r?\\n");

    var matches = blockHeader.match(blockRegex);

    var blockType = "";
    if (matches && (matches.length > 1)) {
        blockType = matches[1];
        Ec.DEBUG_LOG("smaug.js: Smaug.locateArmoredBlock: blockType="+blockType+"\n");
    }

    if (blockType == "UNVERIFIED MESSAGE") {
      // Skip any unverified message block
      return this.locateArmoredBlock(text, endIndex+1, indentStr,
                                     beginIndexObj, endIndexObj, indentStrObj);
    }

    beginIndexObj.value = beginIndex;
    endIndexObj.value = endIndex;

    return blockType;
  },


  extractSignaturePart: function (signatureBlock, part) {
    Ec.DEBUG_LOG("smaug.js: Smaug.extractSignaturePart: part="+part+"\n");

    // Search for blank line
    var offset = signatureBlock.search(/\n\s*\r?\n/);
    if (offset == -1)
      return "";

    offset = signatureBlock.indexOf("\n", offset+1);
    if (offset == -1)
      return "";

    var beginIndex = signatureBlock.indexOf("-----BEGIN PGP SIGNATURE-----",
                                            offset+1);
    if (beginIndex == -1)
      return "";

    if (part == nsIEnigmail.SIGNATURE_TEXT) {
      var signedText = signatureBlock.substr(offset+1, beginIndex-offset-1);

      // Unescape leading dashes
      signedText = signedText.replace(/^- -/, "-");
      signedText = signedText.replace(/\n- -/g, "\n-");
      signedText = signedText.replace(/\r- -/g, "\r-");

      return signedText;
    }

    // Locate newline at end of armor header
    offset = signatureBlock.indexOf("\n", beginIndex);

    if (offset == -1)
      return "";

    var endIndex = signatureBlock.indexOf("-----END PGP SIGNATURE-----", offset);
    if (endIndex == -1)
      return "";

    var signBlock = signatureBlock.substr(offset, endIndex-offset);

    // Search for blank line
    var armorIndex = signBlock.search(/\n\s*\r?\n/);
    if (armorIndex == -1)
      return "";

    if (part == nsIEnigmail.SIGNATURE_HEADERS) {
      return signBlock.substr(1, armorIndex);
    }

    armorIndex = signBlock.indexOf("\n", armorIndex+1);
    if (armorIndex == -1)
      return "";

    if (part == nsIEnigmail.SIGNATURE_ARMOR) {
      var armorData = signBlock.substr(armorIndex, endIndex-armorIndex);
      armorData = armorData.replace(/\s*/g, "");
      return armorData;
    }

    return "";
  },

  statusObjectFrom: function (signatureObj, exitCodeObj, statusFlagsObj, keyIdObj, userIdObj, sigDetailsObj, errorMsgObj, blockSeparationObj) {
    return {
      signature: signatureObj,
      exitCode: exitCodeObj,
      statusFlags: statusFlagsObj,
      keyId: keyIdObj,
      userId: userIdObj,
      signatureDetails: sigDetailsObj,
      message: errorMsgObj,
      blockSeparation: blockSeparationObj
    };
  },

  newStatusObject: function () {
    return this.statusObjectFrom({value: ""}, {}, {}, {}, {}, {}, {}, {});
  },

  mergeStatusInto: function(left, right) {
    left.statusFlags.value = left.statusFlags.value | right.statusFlags.value;
    left.keyId.value = right.keyId.value;
    left.userId.value = right.userId.value;
    left.signatureDetails.value = right.signatureDetails.value;
    left.message.value = right.message.value;
  },

  inlineInnerVerification: function (parent, uiFlags, text, statusObject) {
    Ec.DEBUG_LOG("smaug.js: Smaug.inlineInnerVerification\n");

    if (text && text.indexOf("-----BEGIN PGP SIGNED MESSAGE-----") == 0) {
      var status = this.newStatusObject();
      var newText = this.decryptMessage(parent, uiFlags, text, status.signature, status.exitCode, status.statusFlags, status.keyId, status.userId, status.signatureDetails, status.message, status.blockSeparation);
      if (status.exitCode.value == 0) {
        text = newText;
        this.mergeStatusInto(statusObject, status);
      }
    }

    return text;
  },

  // <EMO>
  smgDecryptMessage: function (parent, statusFlags, fromAddr, cipherText, exitCodeObj, errorMsgObj)
  {
    Ec.DEBUG_LOG("smaug.js: Smaug.smgDecryptMessage: "+cipherText.length+" bytes\n");
    // Ec.DEBUG_LOG("smaug.js: Smaug.smgDecryptMessage: "+cipherText+"\n");

    var ret = "";
    exitCodeObj.value    = -1;
    errorMsgObj.value    = "";

    if (!cipherText) {
      Ec.DEBUG_LOG("smaug.js: Smaug.smgDecryptMessage: NO message\n");
      exitCodeObj.value = 0;
      ret = cipherText;
      statusFlags.value |= nsIEnigmail.NODATA;
    }
    else if (!this.initialized) {
      Ec.ERROR_LOG("smaug.js: Smaug.smgDecryptMessage: not yet initialized\n");
      errorMsgObj.value = Ec.getString("notInit");
      statusFlags.value |= nsIEnigmail.NODATA;
    }
    else
    {
      var clearText = cipherText;
      ret = clearText;
      var success = 0;
      var cipherRegEx = new RegExp("Content-Type:[^\n\r]*application\/x-pkcs7-mime");
      var sigRegEx = new RegExp("Content-Type:[^\n\r]*protocol=\"application\/pkcs7-signature\"")
      // Is this an encrypted messages
      // if (cipherText.search(/Content-Type:[^\n\r]*application\/x-pkcs7-mime/))
      if (cipherRegEx.test(cipherText))
      {
        var ptr = new ctypes.char.ptr();
        success = this.libsmaug.decrypt("local@local", cipherText, ptr.address());
        if (0 == success)
        {
          Ec.ERROR_LOG("smaug.js: Smaug.smgDecryptMessage: unable to decrypt.\n");
          statusFlags.value |= nsIEnigmail.BAD_SIGNATURE | nsIEnigmail.DECRYPTION_FAILED;
        }
        else
        {
          clearText = ptr.readString();
          ret = clearText;
          statusFlags.value |= nsIEnigmail.DECRYPTION_OKAY;
          Ec.DEBUG_LOG("smaug.js: Smaug.smgDecryptMessage: decrypted to "+ret+"\n");
          success = 1;
          exitCodeObj.value = 0;
        }
      }

      // if (clearText.search(/Content-Type:[^\n\r]*protocol="application\/pkcs7-signature"/))
      if (sigRegEx.test(clearText))
      {
        var validSig = this.libsmaug.verify(fromAddr, clearText);
        if (0 == validSig)
        {
Ec.ERROR_LOG("smaug.js: Smaug.smgDecryptMessage: Message is: "+clearText+"\n");
          Ec.ERROR_LOG("smaug.js: Smaug.smgDecryptMessage: signature not valid.\n");
          statusFlags.value |= nsIEnigmail.BAD_SIGNATURE;
        }
        else
        {
          statusFlags.value |= nsIEnigmail.GOOD_SIGNATURE;
          statusFlags.value |= nsIEnigmail.TRUSTED_IDENTITY;
          // ret = getUnicodeData(ret);
          exitCodeObj.value = 0;
        }
      }
    }
    return ret;
  },
  // </EMO>


  decryptMessage: function (parent, uiFlags, cipherText, signatureObj, exitCodeObj,
            statusFlagsObj, keyIdObj, userIdObj, sigDetailsObj, errorMsgObj,
            blockSeparationObj) {
    Ec.DEBUG_LOG("smaug.js: Smaug.decryptMessage: "+cipherText.length+" bytes, "+uiFlags+"\n");

    if (! cipherText)
      return "";

    var interactive = uiFlags & nsIEnigmail.UI_INTERACTIVE;
    var allowImport = uiFlags & nsIEnigmail.UI_ALLOW_KEY_IMPORT;
    var unverifiedEncryptedOK = uiFlags & nsIEnigmail.UI_UNVERIFIED_ENC_OK;
    var oldSignature = signatureObj.value;

    Ec.DEBUG_LOG("smaug.js: Smaug.decryptMessage: oldSignature="+oldSignature+"\n");

    signatureObj.value   = "";
    exitCodeObj.value    = -1;
    statusFlagsObj.value = 0;
    keyIdObj.value       = "";
    userIdObj.value      = "";
    errorMsgObj.value    = "";

    var beginIndexObj = {};
    var endIndexObj = {};
    var indentStrObj = {};
    var blockType = this.locateArmoredBlock(cipherText, 0, "",
                                            beginIndexObj, endIndexObj, indentStrObj);

    if (!blockType || blockType == "SIGNATURE") {
      errorMsgObj.value = Ec.getString("noPGPblock");
      statusFlagsObj.value |= nsIEnigmail.DISPLAY_MESSAGE;
      return "";
    }

    var publicKey = (blockType == "PUBLIC KEY BLOCK");

    var verifyOnly = (blockType == "SIGNED MESSAGE");

    var pgpBlock = cipherText.substr(beginIndexObj.value,
                            endIndexObj.value - beginIndexObj.value + 1);

    if (indentStrObj.value) {
      RegExp.multiline = true;
      var indentRegexp = new RegExp("^"+indentStrObj.value, "g");
      pgpBlock = pgpBlock.replace(indentRegexp, "");
      if (indentStrObj.value.substr(-1) == " ") {
         var indentRegexpStr = "^"+indentStrObj.value.replace(/ $/, "$");
         indentRegexp = new RegExp(indentRegexpStr, "g");
         pgpBlock = pgpBlock.replace(indentRegexp, "");
      }
      RegExp.multiline = false;
    }

    // HACK to better support messages from Outlook: if there are empty lines, drop them
    if (pgpBlock.search(/MESSAGE-----\r?\n\r?\nVersion/) >=0) {
      Ec.DEBUG_LOG("smaug.js: Smaug.decryptMessage: apply Outlook empty line workaround\n");
      pgpBlock = pgpBlock.replace( /\r?\n\r?\n/g, "\n" );
    }

    var head = cipherText.substr(0, beginIndexObj.value);
    var tail = cipherText.substr(endIndexObj.value+1,
                                 cipherText.length - endIndexObj.value - 1);

    if (publicKey) {
      if (!allowImport) {
        errorMsgObj.value = Ec.getString("decryptToImport");
        statusFlagsObj.value |= nsIEnigmail.DISPLAY_MESSAGE;
        statusFlagsObj.value |= nsIEnigmail.INLINE_KEY;

        return "";
      }

      // Import public key
      var importFlags = nsIEnigmail.UI_INTERACTIVE;
      exitCodeObj.value = this.importKey(parent, importFlags, pgpBlock, "",
                                         errorMsgObj);
      if (exitCodeObj.value == 0) {
        statusFlagsObj.value |= nsIEnigmail.IMPORTED_KEY;
      }
      return "";
    }

    var newSignature = "";

    if (verifyOnly) {
      newSignature = this.extractSignaturePart(pgpBlock,
                                                nsIEnigmail.SIGNATURE_ARMOR);

      if (oldSignature && (newSignature != oldSignature)) {
        Ec.ERROR_LOG("smaug.js: Smaug.decryptMessage: Error - signature mismatch "+newSignature+"\n");
        errorMsgObj.value = Ec.getString("sigMismatch");
        statusFlagsObj.value |= nsIEnigmail.DISPLAY_MESSAGE;

        return "";
      }
    }

    var startErrorMsgObj = {};
    var noOutput = false;

    var listener = Ec.newSimpleListener(
      function _stdin (pipe) {
          pipe.write(pgpBlock);
          pipe.close();
      });

    var maxOutput = pgpBlock.length * 100;  // limit output to 100 times message size
                                            // to avoid DoS attack
    var proc = Ec.decryptMessageStart(parent, verifyOnly, noOutput, listener,
                                      statusFlagsObj, startErrorMsgObj,
                                      null, maxOutput);

    if (!proc) {
      errorMsgObj.value = startErrorMsgObj.value;
      statusFlagsObj.value |= nsIEnigmail.DISPLAY_MESSAGE;

      return "";
    }

    // Wait for child to close
    proc.wait();

    var plainText = getUnicodeData(listener.stdoutData);

    var retStatusObj = {};
    var exitCode = Ec.decryptMessageEnd(getUnicodeData(listener.stderrData), listener.exitCode,
                                        plainText.length, verifyOnly, noOutput,
                                        uiFlags, retStatusObj);
    exitCodeObj.value = exitCode;
    statusFlagsObj.value = retStatusObj.statusFlags;
    errorMsgObj.value = retStatusObj.errorMsg;

    userIdObj.value = retStatusObj.userId;
    keyIdObj.value = retStatusObj.keyId;
    sigDetailsObj.value = retStatusObj.sigDetails;
    blockSeparationObj.value = retStatusObj.blockSeparation;


    if ((head.search(/\S/) >= 0) ||
        (tail.search(/\S/) >= 0)) {
      statusFlagsObj.value |= nsIEnigmail.PARTIALLY_PGP;
    }


    if (exitCodeObj.value == 0) {
      // Normal return

      var doubleDashSeparator = false;
      try {
         doubleDashSeparator = this.prefBranch.getBoolPref("doubleDashSeparator");
      } catch(ex) { }

      if (doubleDashSeparator && (plainText.search(/(\r|\n)-- +(\r|\n)/) < 0) ) {
        // Workaround for MsgCompose stripping trailing spaces from sig separator
        plainText = plainText.replace(/(\r|\n)--(\r|\n)/, "$1-- $2");
      }

      statusFlagsObj.value |= nsIEnigmail.DISPLAY_MESSAGE;

      if (verifyOnly && indentStrObj.value) {
        RegExp.multiline = true;
        plainText = plainText.replace(/^/g, indentStrObj.value);
        RegExp.multiline = false;
      }

      return this.inlineInnerVerification(parent, uiFlags, plainText,
                        this.statusObjectFrom(signatureObj, exitCodeObj, statusFlagsObj, keyIdObj, userIdObj, sigDetailsObj, errorMsgObj, blockSeparationObj));
    }

    var pubKeyId = keyIdObj.value;

    if (statusFlagsObj.value & nsIEnigmail.BAD_SIGNATURE) {
      if (verifyOnly && indentStrObj.value) {
        // Probably replied message that could not be verified
        errorMsgObj.value = Ec.getString("unverifiedReply")+"\n\n"+errorMsgObj.value;
        return "";
      }

      // Return bad signature (for checking later)
      signatureObj.value = newSignature;

    } else if (pubKeyId &&
               (statusFlagsObj.value & nsIEnigmail.UNVERIFIED_SIGNATURE)) {

      var innerKeyBlock;
      if (verifyOnly) {
        // Search for indented public key block in signed message
        var innerBlockType = this.locateArmoredBlock(pgpBlock, 0, "- ",
                                                     beginIndexObj, endIndexObj,
                                                     indentStrObj);

        if (innerBlockType == "PUBLIC KEY BLOCK") {

          innerKeyBlock = pgpBlock.substr(beginIndexObj.value,
                                     endIndexObj.value - beginIndexObj.value + 1);

          innerKeyBlock = innerKeyBlock.replace(/- -----/g, "-----");

          statusFlagsObj.value |= nsIEnigmail.INLINE_KEY;
          Ec.DEBUG_LOG("smaug.js: Smaug.decryptMessage: innerKeyBlock found\n");
        }
      }

      if (allowImport) {

        var importedKey = false;

        if (innerKeyBlock) {
          var importErrorMsgObj = {};
          var importFlags2 = nsIEnigmail.UI_INTERACTIVE;
          var exitStatus = this.importKey(parent, importFlags2, innerKeyBlock,
                                          pubKeyId, importErrorMsgObj);

          importedKey = (exitStatus == 0);

          if (exitStatus > 0) {
            Ec.alert(parent, Ec.getString("cantImport")+importErrorMsgObj.value);
          }
        }

        if (importedKey) {
          // Recursive call; note that nsIEnigmail.UI_ALLOW_KEY_IMPORT is unset
          // to break the recursion
          var uiFlagsDeep = interactive ? nsIEnigmail.UI_INTERACTIVE : 0;
          signatureObj.value = "";
          return this.decryptMessage(parent, uiFlagsDeep, pgpBlock,
                                      signatureObj, exitCodeObj, statusFlagsObj,
                                      keyIdObj, userIdObj, sigDetailsObj, errorMsgObj);
        }

      }

      if (plainText && !unverifiedEncryptedOK) {
        // Append original PGP block to unverified message
        plainText = "-----BEGIN PGP UNVERIFIED MESSAGE-----\r\n" + plainText +
                    "-----END PGP UNVERIFIED MESSAGE-----\r\n\r\n" + pgpBlock;
      }

    }

    return verifyOnly ? "" : plainText;
  },



  extractKey: function (parent, exportFlags, userId, outputFile, exitCodeObj, errorMsgObj) {
    Ec.DEBUG_LOG("smaug.js: Smaug.extractKey: "+userId+"\n");

    if (!this.initialized) {
      Ec.ERROR_LOG("smaug.js: Smaug.extractKey: not yet initialized\n");
      errorMsgObj.value = Ec.getString("notInit");
      return "";
    }

    var uidList=userId.split(/[ ,\t]+/);

    var args = Ec.getAgentArgs(true);
    args = args.concat(["-a", "--export"]);
    args = args.concat(uidList);

    var statusFlagsObj = {};
    var statusMsgObj   = {};
    var cmdErrorMsgObj = {};

    var keyBlock = this.execCmd(this.agentPath, args, null, "",
                      exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

    if ((exitCodeObj.value == 0) && !keyBlock)
      exitCodeObj.value = -1;

    if (exitCodeObj.value != 0) {
      errorMsgObj.value = Ec.getString("failKeyExtract");

      if (cmdErrorMsgObj.value) {
        errorMsgObj.value += "\n" + Ec.printCmdLine(this.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }

      return "";
    }

    if (exportFlags & nsIEnigmail.EXTRACT_SECRET_KEY) {
      args = Ec.getAgentArgs(true);
      args = args.concat(["-a", "--export-secret-keys"]);
      args = args.concat(uidList);

      var secKeyBlock = this.execCmd(this.agentPath, args, null, "",
                      exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

      if ((exitCodeObj.value == 0) && !secKeyBlock)
        exitCodeObj.value = -1;

      if (exitCodeObj.value != 0) {
        errorMsgObj.value = Ec.getString("failKeyExtract");

        if (cmdErrorMsgObj.value) {
          errorMsgObj.value += "\n" + Ec.printCmdLine(this.agentPath, args);;
          errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
        }

        return "";
      }

      if (keyBlock.substr(-1,1).search(/[\r\n]/)<0) keyBlock += "\n";
      keyBlock+=secKeyBlock;
    }

    if (outputFile) {
      if (! SmaugFuncs.writeFileContents(outputFile, keyBlock, DEFAULT_FILE_PERMS)) {
        exitCodeObj.value = -1;
        errorMsgObj.value = Ec.getString("fileWriteFailed", [ outputFile ]);
      }
      return "";
    }
    return keyBlock;
  },


  // ExitCode == 0  => success
  // ExitCode > 0   => error
  // ExitCode == -1 => Cancelled by user
  importKey: function (parent, uiFlags, msgText, keyId, errorMsgObj) {
    Ec.DEBUG_LOG("smaug.js: Smaug.importKey: id="+keyId+", "+uiFlags+"\n");

    if (!this.initialized) {
      Ec.ERROR_LOG("smaug.js: Smaug.importKey: not yet initialized\n");
      errorMsgObj.value = Ec.getString("notInit");
      return 1;
    }

    var beginIndexObj = {};
    var endIndexObj   = {};
    var indentStrObj   = {};
    var blockType = this.locateArmoredBlock(msgText, 0, "",
                                            beginIndexObj, endIndexObj,
                                            indentStrObj);

    if (!blockType) {
      errorMsgObj.value = Ec.getString("noPGPblock");
      return 1;
    }

    if (blockType != "PUBLIC KEY BLOCK") {
      errorMsgObj.value = Ec.getString("notFirstBlock");
      return 1;
    }

    var pgpBlock = msgText.substr(beginIndexObj.value,
                                  endIndexObj.value - beginIndexObj.value + 1);

    var interactive = uiFlags & nsIEnigmail.UI_INTERACTIVE;

    if (interactive) {
      if (!Ec.confirmDlg(parent, Ec.getString("importKeyConfirm"), Ec.getString("keyMan.button.import"))) {
        errorMsgObj.value = Ec.getString("failCancel");
        return -1;
      }
    }

    var args = Ec.getAgentArgs(true);
    args.push("--import");

    var exitCodeObj    = {};
    var statusFlagsObj = {};
    var statusMsgObj   = {};

    var output = this.execCmd(this.agentPath, args, null, pgpBlock,
                        exitCodeObj, statusFlagsObj, statusMsgObj, errorMsgObj);

    var statusMsg = statusMsgObj.value;

    var pubKeyId;

    if (exitCodeObj.value == 0) {
      // Normal return
      this.invalidateUserIdList();
      if (statusMsg && (statusMsg.search("IMPORTED ") > -1)) {
        var matches = statusMsg.match(/(^|\n)IMPORTED (\w{8})(\w{8})/);

        if (matches && (matches.length > 3)) {
          pubKeyId = "0x" + matches[3];
          Ec.DEBUG_LOG("smaug.js: Smaug.importKey: IMPORTED "+pubKeyId+"\n");
        }
      }
    }

    return exitCodeObj.value;
  },

  importKeyFromFile: function (parent, inputFile, errorMsgObj, importedKeysObj) {
    Ec.DEBUG_LOG("smaug.js: Smaug.importKeyFromFile: fileName="+inputFile.path+"\n");
    importedKeysObj.value="";

    // <EMO>
    var ret = 1;
    if (!this.initialized) {
      Ec.ERROR_LOG("smaug.js: Smaug.importKeyFromFile: not yet initialized\n");
      errorMsgObj.value = Ec.getString("notInit");
    }
    else
    {
      Ec.DEBUG_LOG("smaug.js: Smaug.importKeyFromFile: prime()'ing libsmaug...\n");

      this.prefBranch.setCharPref("smaugSmimeCertPath", inputFile.path);

      var logFile = "";
      var prefix = this.getLogDirectoryPrefix();
      if (prefix)
      {
        logFile = prefix + "smauglog.out";
      }
      ret = !this.libsmaug.prime("local@local", inputFile.path, logFile);
    }

    Ec.ERROR_LOG("smaug.js: Smaug.importKeyFromFile: returning: " + ret + "\n");
    return ret;

    /*
    var fileName=Ec.getEscapedFilename(getFilePath(inputFile.QueryInterface(Ci.nsIFile)));

    var args = Ec.getAgentArgs(true);
    args.push("--import");
    args.push(fileName);

    var statusFlagsObj = {};
    var statusMsgObj   = {};
    var exitCodeObj    = {};

    var output = this.execCmd(this.agentPath, args, null, "",
                        exitCodeObj, statusFlagsObj, statusMsgObj, errorMsgObj);

    var statusMsg = statusMsgObj.value;

    var keyList = new Array();

    if (exitCodeObj.value == 0) {
      // Normal return
      this.invalidateUserIdList();

      var statusLines = statusMsg.split(/\r?\n/);

      // Discard last null string, if any

      for (var j=0; j<statusLines.length; j++) {
        var matches = statusLines[j].match(/IMPORT_OK ([0-9]+) (\w+)/);
        if (matches && (matches.length > 2)) {
          if (typeof (keyList[matches[2]]) != "undefined") {
            keyList[matches[2]] |= new Number(matches[1]);
          }
          else
            keyList[matches[2]] = new Number(matches[1]);

          Ec.DEBUG_LOG("smaug.js: Smaug.importKey: imported "+matches[2]+":"+matches[1]+"\n");
        }
      }

      for (j in keyList) {
        importedKeysObj.value += j+":"+keyList[j]+";";
      }
    }

    return exitCodeObj.value;
    */
    // </EMO>
  },

  createMessageURI: function (originalUrl, contentType, contentCharset, contentData, persist) {
    Ec.DEBUG_LOG("smaug.js: Smaug.createMessageURI: "+originalUrl+
              ", "+contentType+", "+contentCharset+"\n");

    var messageId = "msg" + Math.floor(Math.random()*1.0e9);

    this._messageIdList[messageId] = {originalUrl:originalUrl,
                                      contentType:contentType,
                                      contentCharset:contentCharset,
                                      contentData:contentData,
                                      persist:persist};

    return "smaug:message/"+messageId;
  },

  deleteMessageURI: function (uri) {
    Ec.DEBUG_LOG("smaug.js: Smaug.deleteMessageURI: "+uri+"\n");

    var messageId = ExtractMessageId(uri);

    if (!messageId)
      return false;

    return (delete this._messageIdList[messageId]);
  },

  invalidateUserIdList: function () {
    // clean the userIdList to force reloading the list at next usage
    Ec.DEBUG_LOG("smaug.js: Smaug.invalidateUserIdList\n");
    this.userIdList= null;
  },

  // returns the output of -with-colons --list[-secret]-keys
  getUserIdList: function  (secretOnly, refresh, exitCodeObj, statusFlagsObj, errorMsgObj) {

    if (secretOnly || refresh || this.userIdList == null) {
      var args = Ec.getAgentArgs(true);

      if (secretOnly) {
        args=args.concat(["--with-fingerprint", "--fixed-list-mode", "--with-colons", "--list-secret-keys"]);
      }
      else {
        args=args.concat(["--with-fingerprint", "--fixed-list-mode", "--with-colons", "--list-keys"]);
      }

      if (!this.initialized) {
        Ec.ERROR_LOG("smaug.js: Smaug.getUserIdList: not yet initialized\n");
        errorMsgObj.value = Ec.getString("notInit");
        return "";
      }

      statusFlagsObj.value = 0;

      var statusMsgObj   = {};
      var cmdErrorMsgObj = {};

      var listText = this.execCmd(this.agentPath, args, null, "",
                        exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

      if (exitCodeObj.value != 0) {
        errorMsgObj.value = Ec.getString("badCommand");
        if (cmdErrorMsgObj.value) {
          errorMsgObj.value += "\n" + Ec.printCmdLine(this.agentPath, args);
          errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
        }

        return "";
      }

      listText=listText.replace(/(\r\n|\r)/g, "\n");
      if (secretOnly) {
        return listText;
      }
      this.userIdList = listText;
    }
    else {
      exitCodeObj.value=0;
      statusFlagsObj.value=0;
      errorMsgObj.value="";
    }

    return this.userIdList;
  },

  // returns the output of --with-colons --list-sig
  getKeySig: function  (keyId, exitCodeObj, errorMsgObj) {

    var keyIdList = keyId.split(" ");
    var args = Ec.getAgentArgs(true);
    args=args.concat(["--with-fingerprint", "--fixed-list-mode", "--with-colons", "--list-sig"]);
    args=args.concat(keyIdList);

    if (!this.initialized) {
      Ec.ERROR_LOG("smaug.js: Smaug.getKeySig: not yet initialized\n");
      errorMsgObj.value = Ec.getString("notInit");
      return "";
    }

    var statusFlagsObj = {};
    var statusMsgObj   = {};
    var cmdErrorMsgObj = {};

    var listText = this.execCmd(this.agentPath, args, null, "",
                      exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

    if (exitCodeObj.value != 0) {
      errorMsgObj.value = Ec.getString("badCommand");
      if (cmdErrorMsgObj.value) {
        errorMsgObj.value += "\n" + Ec.printCmdLine(this.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }

      return "";
    }
    return listText;
  },

  /**
   * Return details of given keys.
   *
   * @param  String  keyId              List of keys with 0x, separated by spaces.
   * @param  Boolean uidOnly            false:
   *                                      return all key details (full output of GnuPG)
   *                                    true:
   *                                      return only the user ID fields. Only UIDs with highest trust
   *                                      level are returned.
   * @param  Boolean withUserAttributes true: if uidOnly include "uat:jpegPhoto" (but not subkey IDs)
   *
   * @return String all key details or list of user IDs separated by \n.
   */
  getKeyDetails: function (keyId, uidOnly, withUserAttributes)
  {
    var args = Ec.getAgentArgs(true);
    var keyIdList = keyId.split(" ");
    args=args.concat([ "--fixed-list-mode", "--with-colons", "--list-keys"]);
    args=args.concat(keyIdList);

    var statusMsgObj   = {};
    var cmdErrorMsgObj = {};
    var statusFlagsObj = {};
    var exitCodeObj = {};

    var listText = this.execCmd(this.agentPath, args, null, "",
                                exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);
    if (exitCodeObj.value != 0) {
      return "";
    }
    listText=listText.replace(/(\r\n|\r)/g, "\n");

    const TRUSTLEVELS_SORTED = SmaugFuncs.trustlevelsSorted();
    var maxTrustLevel = -1;

    if (uidOnly) {
      var userList="";
      var hideInvalidUid=true;
      var lineArr=listText.split(/\n/);
      for (var i=0; i<lineArr.length; i++) {
        // process lines such as:
        //  tru::1:1395895453:1442881280:3:1:5
        //  pub:f:4096:1:C1B875ED336XX959:2299509307:1546189300::f:::scaESCA:
        //  fpr:::::::::102A1C8CC524A966849C33D7C8B157EA336XX959:
        //  uid:f::::1388511201::67D5B96DC564598D4D4D9E0E89F5B83C9931A154::Joe Fox <joe@fox.com>:
        //  sig:::1:C8B157EA336XX959:2299509307::::Joe Fox <joe@fox.com>:13x:::::2:
        //  sub:e:2048:1:B214734F0F5C7041:1316219469:1199912694:::::e:
        //  sub:f:2048:1:70E7A471DABE08B0:1316221524:1546189300:::::s:
        var lineTokens = lineArr[i].split(/:/);
        switch (lineTokens[0]) {
          case "pub":
            if (SmaugFuncs.isInvalid(lineTokens[1])) {
              // pub key not valid (anymore)-> display all UID's
              hideInvalidUid = false;
            }
            break;
          case "uid":
            if (uidOnly && hideInvalidUid) {
              var thisTrust = TRUSTLEVELS_SORTED.indexOf(lineTokens[1]);
              if (thisTrust > maxTrustLevel) {
                userList = lineTokens[9] + "\n";
                maxTrustLevel = thisTrust;
              }
              else if (thisTrust == maxTrustLevel) {
                userList += lineTokens[9] + "\n";
              }
              // else do not add uid
            }
            else if (!SmaugFuncs.isInvalid(lineTokens[1]) || !hideInvalidUid) {
              // UID valid  OR  key not valid, but invalid keys allowed
              userList += lineTokens[9] + "\n";
            }
            break;
          case "uat":
            if (withUserAttributes) {
              if (!SmaugFuncs.isInvalid(lineTokens[1]) || !hideInvalidUid) {
                // IF  UID valid  OR  key not valid and invalid keys allowed
                userList += "uat:jpegPhoto:" + lineTokens[4] + "\n";
              }
            }
            break;
        }
      }
      return userList.replace(/^\n+/, "").replace(/\n+$/, "").replace(/\n\n+/g, "\n");
    }

    return listText;
  },


  /**
   * Return first found userId of given keys.
   * @param  String  keyId key with leading 0x
   * @return String  First found of user IDs or null if none
   */
  getFirstUserIdOfKey: function (keyId)
  {
    var args = Ec.getAgentArgs(true);
    args=args.concat([ "--fixed-list-mode", "--with-colons", "--list-keys"]);
    args=args.concat([keyId]);

    var statusMsgObj   = {};
    var cmdErrorMsgObj = {};
    var statusFlagsObj = {};
    var exitCodeObj = {};

    var listText = this.execCmd(this.agentPath, args, null, "",
                                exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);
    if (exitCodeObj.value != 0) {
      return null;
    }
    listText=listText.replace(/(\r\n|\r)/g, "\n");

    var lineArr=listText.split(/\n/);
    for (var i=0; i<lineArr.length; i++) {
      // process lines such as:
      //  tru::1:1395895453:1442881280:3:1:5
      //  pub:f:4096:1:C1B875ED336XX959:2299509307:1546189300::f:::scaESCA:
      //  fpr:::::::::102A1C8CC524A966849C33D7C8B157EA336XX959:
      //  uid:f::::1388511201::67D5B96DC564598D4D4D9E0E89F5B83C9931A154::Joe Fox <joe@fox.com>:
      //  sig:::1:C8B157EA336XX959:2299509307::::Joe Fox <joe@fox.com>:13x:::::2:
      var lineTokens = lineArr[i].split(/:/);
      switch (lineTokens[0]) {
        case "uid":
          {
            var userId = lineTokens[9];
            return userId;
          }
          break;
      }
    }
    return null;
  },


  // returns the output of --with-colons --list-config
  getGnupgConfig: function  (exitCodeObj, errorMsgObj)
  {
    var args = Ec.getAgentArgs(true);

    args=args.concat(["--fixed-list-mode", "--with-colons", "--list-config"]);

    if (!this.initialized) {
      Ec.ERROR_LOG("smaug.js: Smaug.getGnupgConfig: not yet initialized\n");
      errorMsgObj.value = Ec.getString("notInit");
      return "";
    }

    var statusMsgObj   = {};
    var cmdErrorMsgObj = {};
    var statusFlagsObj = {};

    var listText = this.execCmd(this.agentPath, args, null, "",
                      exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

    if (exitCodeObj.value != 0) {
      errorMsgObj.value = Ec.getString("badCommand");
      if (cmdErrorMsgObj.value) {
        errorMsgObj.value += "\n" + Ec.printCmdLine(this.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }

      return "";
    }

    listText=listText.replace(/(\r\n|\r)/g, "\n");
    return listText;
  },


  encryptAttachment: function (parent, fromMailAddr, toMailAddr, bccMailAddr, sendFlags, inFile, outFile,
            exitCodeObj, statusFlagsObj, errorMsgObj) {
    Ec.DEBUG_LOG("smaug.js: Smaug.encryptAttachment infileName="+inFile.path+"\n");

    if (!this.initialized) {
      Ec.ERROR_LOG("smaug.js: Smaug.encryptAttachment: not yet initialized\n");
      errorMsgObj.value = Ec.getString("notInit");
      return "";
    }

    statusFlagsObj.value = 0;
    sendFlags |= nsIEnigmail.SEND_ATTACHMENT;

    var asciiArmor = false;
    try {
      asciiArmor = this.prefBranch.getBoolPref("inlineAttachAsciiArmor");
    } catch (ex) {}
    var asciiFlags = (asciiArmor ? ENC_TYPE_ATTACH_ASCII : ENC_TYPE_ATTACH_BINARY);

    var args = Ec.getEncryptCommand(fromMailAddr, toMailAddr, bccMailAddr, "", sendFlags, asciiFlags, errorMsgObj);

    if (! args)
        return null;

    var passphrase = null;
    var signMessage = (sendFlags & nsIEnigmail.SEND_SIGNED);

    if (signMessage ) {
      args = args.concat(Ec.passwdCommand());

      var passwdObj = {};
      var useAgentObj = {};

      if (!Ec.getPassphrase(parent, passwdObj, useAgentObj, 0)) {
         Ec.ERROR_LOG("smaug.js: Smaug.encryptAttachment: Error - no passphrase supplied\n");

         statusFlagsObj.value |= nsIEnigmail.MISSING_PASSPHRASE;
         return null;
      }

      if (!useAgentObj.value) passphrase = passwdObj.value;
    }

    var inFilePath  = Ec.getEscapedFilename(getFilePath(inFile.QueryInterface(Ci.nsIFile)));
    var outFilePath = Ec.getEscapedFilename(getFilePath(outFile.QueryInterface(Ci.nsIFile)));

    args = args.concat(["--yes", "-o", outFilePath, inFilePath ]);

    var statusMsgObj   = {};
    var cmdErrorMsgObj = {};

    var msg = this.execCmd(this.agentPath, args, passphrase, "",
                      exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

    if (exitCodeObj.value != 0) {

      if (cmdErrorMsgObj.value) {
        errorMsgObj.value = Ec.printCmdLine(this.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }
      else {
        errorMsgObj.value = "An unknown error has occurred";
      }

      return "";
    }

    return msg;
  },


  verifyAttachment: function (parent, verifyFile, sigFile,
                              statusFlagsObj, errorMsgObj) {
    Ec.DEBUG_LOG("smaug.js: Smaug.verifyAttachment:\n");

    var exitCode        = -1;
    var verifyFilePath  = Ec.getEscapedFilename(getFilePath(verifyFile.QueryInterface(Ci.nsIFile)));
    var sigFilePath     = Ec.getEscapedFilename(getFilePath(sigFile.QueryInterface(Ci.nsIFile)));

    var args = Ec.getAgentArgs(true);
    args.push("--verify");
    args.push(sigFilePath);
    args.push(verifyFilePath);

    var listener = Ec.newSimpleListener();

    var proc = Ec.execStart(this.agentPath, args, false, parent,
                              listener, statusFlagsObj);

    if (!proc) {
      return -1;
    }
    proc.wait();

    var retObj = {};

    Ec.decryptMessageEnd (listener.stderrData, listener.exitCode, 1, true, true, nsIEnigmail.UI_INTERACTIVE, retObj);

    if (listener.exitCode == 0) {
      var detailArr = retObj.sigDetails.split(/ /);
      var dateTime = Ec.getDateTime(detailArr[2], true, true);
      var msg1 = retObj.errorMsg.split(/\n/)[0];

      var msg2 = Ec.getString("keyAndSigDate", ["0x"+retObj.keyId.substr(-8, 8), dateTime ]);
      errorMsgObj.value = msg1 + "\n" + msg2;
    }
    else {
      errorMsgObj.value = retObj.errorMsg;
    }

    return listener.exitCode;
  },


  decryptAttachment: function (parent, outFile, displayName, byteData,
            exitCodeObj, statusFlagsObj, errorMsgObj) {
    Ec.DEBUG_LOG("smaug.js: Smaug.decryptAttachment: parent="+parent+", outFileName="+outFile.path+"\n");

    var attachmentHead = byteData.substr(0,200);
    if (attachmentHead.match(/\-\-\-\-\-BEGIN PGP \w+ KEY BLOCK\-\-\-\-\-/)) {
      // attachment appears to be a PGP key file

      if (Ec.confirmDlg(parent, Ec.getString("attachmentPgpKey", [ displayName ]),
            Ec.getString("keyMan.button.import"), Ec.getString("dlg.button.view"))) {
        exitCodeObj.value = this.importKey(parent, 0, byteData, "", errorMsgObj);
        statusFlagsObj.value = gStatusFlags.IMPORTED;
      }
      else {
        exitCodeObj.value = 0;
        statusFlagsObj.value = nsIEnigmail.DISPLAY_MESSAGE;
      }
      return true;
    }

    var outFileName = Ec.getEscapedFilename(getFilePath(outFile.QueryInterface(Ci.nsIFile), NS_WRONLY));

    var args = Ec.getAgentArgs(true);
    args = args.concat(["-o", outFileName, "--yes"]);
    args = args.concat(Ec.passwdCommand());
    args.push("-d");


    statusFlagsObj.value = 0;

    var passphrase = null;
    var passwdObj = {};
    var useAgentObj = {};

    if (!Ec.getPassphrase(parent, passwdObj, useAgentObj, 0)) {
      Ec.ERROR_LOG("smaug.js: Smaug.decryptAttachment: Error - no passphrase supplied\n");

      statusFlagsObj.value |= nsIEnigmail.MISSING_PASSPHRASE;
      return null;
    }

    passphrase = passwdObj.value;

    var listener = Ec.newSimpleListener(
      function _stdin(pipe) {
        if (Ec.requirePassword()) {
          pipe.write(passphrase+"\n");
        }
        pipe.write(byteData);
        pipe.close();
      });


    var proc = Ec.execStart(this.agentPath, args, false, parent,
                            listener, statusFlagsObj);

    if (!proc) {
      return false;
    }

    // Wait for child STDOUT to close
    proc.wait();

    var statusMsgObj = {};
    var cmdLineObj   = {};

    exitCodeObj.value = Ec.execEnd(listener, statusFlagsObj, statusMsgObj, cmdLineObj, errorMsgObj);

    return true;

  },

  getCardStatus: function(exitCodeObj, errorMsgObj) {
    Ec.DEBUG_LOG("smaug.js: Smaug.getCardStatus\n");
    var args = Ec.getAgentArgs(false);

    args = args.concat(["--status-fd", "2", "--fixed-list-mode", "--with-colons", "--card-status"]);
    var statusMsgObj = {};
    var statusFlagsObj = {};

    var outputTxt = this.execCmd(this.agentPath, args, null, "",
                  exitCodeObj, statusFlagsObj, statusMsgObj, errorMsgObj);

    if ((exitCodeObj.value == 0) && !outputTxt) {
      exitCodeObj.value = -1;
      return "";
    }

    return outputTxt;
  },

  showKeyPhoto: function(keyId, photoNumber, exitCodeObj, errorMsgObj) {
    Ec.DEBUG_LOG("smaug.js: Smaug.showKeyPhoto, keyId="+keyId+" photoNumber="+photoNumber+"\n");

    var args = Ec.getAgentArgs();
    args = args.concat(["--no-secmem-warning", "--no-verbose", "--no-auto-check-trustdb", "--batch", "--no-tty", "--status-fd", "1", "--attribute-fd", "2" ]);
    args = args.concat(["--fixed-list-mode", "--list-keys", keyId]);

    var photoDataObj = {};

    var outputTxt = this.simpleExecCmd(this.agentPath, args, exitCodeObj, photoDataObj);

    if ((exitCodeObj.value == 0) && !outputTxt) {
      exitCodeObj.value = -1;
      return "";
    }

    if (Ec.isDosLike()) {
      // workaround for error in gpg
      photoDataObj.value=photoDataObj.value.replace(/\r\n/g, "\n");
    }

  // [GNUPG:] ATTRIBUTE A053069284158FC1E6770BDB57C9EB602B0717E2 2985
    var foundPicture = -1;
    var skipData = 0;
    var imgSize = -1;
    var statusLines = outputTxt.split(/[\n\r+]/);

    for (var i=0; i < statusLines.length; i++) {
      var matches = statusLines[i].match(/\[GNUPG:\] ATTRIBUTE ([A-F\d]+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)/);
      if (matches && matches[3]=="1") {
        // attribute is an image
        ++foundPicture;
        if (foundPicture == photoNumber) {
          imgSize = Number(matches[2]);
          break;
        }
        else {
          skipData += Number(matches[2]);
        }
      }
    }

    if (foundPicture>=0 && foundPicture == photoNumber) {
      var pictureData = photoDataObj.value.substr(16+skipData, imgSize);
      if (! pictureData.length)
        return "";
      try {
        var flags = NS_WRONLY | NS_CREATE_FILE | NS_TRUNCATE;

        var ds = Cc[DIR_SERV_CONTRACTID].getService();
        var dsprops = ds.QueryInterface(Ci.nsIProperties);
        var picFile = dsprops.get("TmpD", Ci.nsIFile);

        picFile.append(keyId+".jpg");
        picFile.createUnique(picFile.NORMAL_FILE_TYPE, DEFAULT_FILE_PERMS);

        var fileStream = Cc[NS_LOCALFILEOUTPUTSTREAM_CONTRACTID].createInstance(Ci.nsIFileOutputStream);
        fileStream.init(picFile, flags, DEFAULT_FILE_PERMS, 0);
        if (fileStream.write(pictureData, pictureData.length) != pictureData.length)
            throw Components.results.NS_ERROR_FAILURE;

        fileStream.flush();
        fileStream.close();
      }
      catch (ex) {
        exitCodeObj.value = -1;
        return "";
      }
    }
    return picFile.path;
  },


  // Methods for handling Per-Recipient Rules

  getRulesFile: function () {
    Ec.DEBUG_LOG("smaug.js: getRulesFile\n");
    var ds = Cc[DIR_SERV_CONTRACTID].getService();
    var dsprops = ds.QueryInterface(Ci.nsIProperties);
    var rulesFile = dsprops.get("ProfD", Ci.nsIFile);
    rulesFile.append("pgprules.xml");
    return rulesFile;
  },

  loadRulesFile: function () {
    Ec.DEBUG_LOG("smaug.js: loadRulesFile\n");
    var flags = NS_RDONLY;
    var rulesFile = this.getRulesFile();
    if (rulesFile.exists()) {
      var fileContents = readFile(rulesFile);

      if (fileContents.length==0 || fileContents.search(/^\s*$/)==0) {
        return false;
      }

      var domParser=Cc[NS_DOMPARSER_CONTRACTID].createInstance(Ci.nsIDOMParser);
      this.rulesList = domParser.parseFromString(fileContents, "text/xml");

      return true;
    }
    return false;
  },

  saveRulesFile: function () {
    Ec.DEBUG_LOG("smaug.js: saveRulesFile\n");

    var flags = NS_WRONLY | NS_CREATE_FILE | NS_TRUNCATE;
    var domSerializer=Cc[NS_DOMSERIALIZER_CONTRACTID].createInstance(Ci.nsIDOMSerializer);
    var rulesFile = this.getRulesFile();
    if (rulesFile) {
      if (this.rulesList) {
        // the rule list is not empty -> write into file
        return SmaugFuncs.writeFileContents(rulesFile.path,
                               domSerializer.serializeToString(this.rulesList.firstChild),
                               DEFAULT_FILE_PERMS);
      }
      else {
        // empty rule list -> delete rules file
        try {
          rulesFile.remove(false);
        }
        catch (ex) {}
        return true;
      }
    }
    else
      return false;
  },

  getRulesData: function (rulesListObj) {
    Ec.DEBUG_LOG("smaug.js: getRulesData\n");
    var ret=true;
    if (! this.rulesList) {
       ret=this.loadRulesFile();
    }
    if (this.rulesList) {
      rulesListObj.value = this.rulesList;
      return ret;
    }

    rulesListObj.value = null;
    return false;
  },

  addRule: function (appendToEnd, toAddress, keyList, sign, encrypt, pgpMime, flags) {
    Ec.DEBUG_LOG("smaug.js: addRule\n");
    if (! this.rulesList) {
      var domParser=Cc[NS_DOMPARSER_CONTRACTID].createInstance(Ci.nsIDOMParser);
      this.rulesList = domParser.parseFromString("<pgpRuleList/>", "text/xml");
    }
    var negate = (flags & 1);
    var rule=this.rulesList.createElement("pgpRule");
    rule.setAttribute("email", toAddress);
    rule.setAttribute("keyId", keyList);
    rule.setAttribute("sign", sign);
    rule.setAttribute("encrypt", encrypt);
    rule.setAttribute("pgpMime", pgpMime);
    rule.setAttribute("negateRule", flags);
    var origFirstChild = this.rulesList.firstChild.firstChild;

    if (origFirstChild && (! appendToEnd)) {
      this.rulesList.firstChild.insertBefore(rule, origFirstChild);
      this.rulesList.firstChild.insertBefore(this.rulesList.createTextNode(Ec.isDosLike() ? "\r\n" : "\n"), origFirstChild);
    }
    else {
      this.rulesList.firstChild.appendChild(rule);
      this.rulesList.firstChild.appendChild(this.rulesList.createTextNode(Ec.isDosLike() ? "\r\n" : "\n"));
    }

  },

  clearRules: function () {
    this.rulesList = null;
  }

}; // Smaug.protoypte


function SmgCmdLineHandler() {}

SmgCmdLineHandler.prototype = {
  classDescription: "Smaug Key Management CommandLine Service",
  classID:  NS_SMGCLINE_SERVICE_CID,
  contractID: NS_CLINE_SERVICE_CONTRACTID,
  _xpcom_categories: [{
    category: "command-line-handler",
    entry: "cline-smaug",
    service: false
  }],
  QueryInterface: XPCOMUtils.generateQI([nsICommandLineHandler, nsIFactory, nsISupports]),

  // nsICommandLineHandler
  handle: function(cmdLine) {
    if (cmdLine.handleFlag("pgpkeyman", false)) {
      cmdLine.preventDefault = true; // do not open main app window

      var wwatch = Cc["@mozilla.org/embedcomp/window-watcher;1"]
                             .getService(Ci.nsIWindowWatcher);
      wwatch.openWindow(null, "chrome://smaug/content/smaugKeyManager.xul", "_blank",
                        "chrome,dialog=no,all", cmdLine);
    }
  },

  helpInfo: "  -pgpkeyman         Open the OpenPGP key management.\n",

  lockFactory: function (lock) {}
};


///////////////////////////////////////////////////////////////////////////////

var NSGetFactory = XPCOMUtils.generateNSGetFactory([Smaug, SmaugProtocolHandler, SmgCmdLineHandler]);
dump("smaug.js: Registered components\n");
