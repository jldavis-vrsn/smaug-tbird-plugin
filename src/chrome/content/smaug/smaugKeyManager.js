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
 * The Initial Developer of the Original Code is Patrick Brunschwig.
 * Portions created by Patrick Brunschwig <patrick@enigmail.net> are
 * Copyright (C) 2004 Patrick Brunschwig. All Rights Reserved.
 *
 * Contributor(s):
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

// Uses: chrome://smaug/content/smaugCommon.js

Components.utils.import("resource://smaug/keyManagement.jsm");

// Initialize smaugCommon
SmgInitCommon("smaugKeyManager");

const SCc = Components.classes;
const SCi = Components.interfaces;

const INPUT = 0;
const RESULT = 1;


var gUserList;
var gResult;
var gSendEncrypted=true;
var gKeyList;
var gSmgRemoveListener = false;
var gSmgLastSelectedKeys = null;
var gKeySortList = null;
var gSmgIpcRequest = null;
var gSmgCallbackFunc = null;
var gSearchInput = null;
var gShowAllKeysElement = null;
var gTreeChildren = null;
var gShowInvalidKeys = null;
var gShowUntrustedKeys = null;
var gShowOthersKeys = null;

function smaugKeyManagerLoad() {
  DEBUG_LOG("smaugKeyManager.js: smaugKeyManagerLoad\n");
  gUserList = document.getElementById("pgpKeyList");
  gSearchInput = document.getElementById("filterKey");
  gShowAllKeysElement = document.getElementById("showAllKeys");
  gTreeChildren = document.getElementById("pgpKeyListChildren");
  gShowInvalidKeys = document.getElementById("showInvalidKeys");
  gShowUntrustedKeys = document.getElementById("showUntrustedKeys");
  gShowOthersKeys = document.getElementById("showOthersKeys");

  if (SmgGetPref("keyManShowAllKeys")) {
    gShowAllKeysElement.setAttribute("checked", "true");
  }

  gUserList.addEventListener('click', smaugOnClick, true);
  document.getElementById("bcEnableKey").setAttribute("label", SmgGetString("keyMan.disableKey"));

  window.smgIpcRequest = null;

  document.getElementById("pleaseWait").showPopup(gSearchInput, -1, -1, "tooltip", "after_end", "");
  document.getElementById("statusText").value = SmgGetString("keyMan.loadingKeys");
  document.getElementById("progressBar").removeAttribute("collapsed");
  SmaugCommon.dispatchEvent(loadkeyList, 100, null);
  gSearchInput.focus();
}

function displayFullList() {
  return (gShowAllKeysElement.getAttribute("checked") == "true");
}

function loadkeyList() {
  DEBUG_LOG("smaugKeyManager.js: loadkeyList\n");

  //smaugBuildList(false);
  sortTree();
  showOrHideAllKeys();
  document.getElementById("pleaseWait").hidePopup();
  document.getElementById("statusText").value=" ";
  document.getElementById("progressBar").setAttribute("collapsed", "true");
}

function smaugRefreshKeys() {
  DEBUG_LOG("smaugKeyManager.js: smaugRefreshKeys\n");
  var keyList = smaugGetSelectedKeys();
  gSmgLastSelectedKeys = [];
  for (var i=0; i<keyList.length; i++) {
    gSmgLastSelectedKeys[keyList[i]] = 1;
  }

  smaugClearTree();
  smaugBuildList(true);
  smgApplyFilter();
}

function smaugClearTree() {
  var treeChildren = gTreeChildren;
  while (treeChildren.firstChild) {
    treeChildren.removeChild(treeChildren.firstChild);
  }
}

function smaugBuildList(refresh) {
  DEBUG_LOG("smaugKeyManager.js: smaugBuildList\n");

  var keyListObj = {};

  SmgLoadKeyList(refresh, keyListObj, getSortColumn(), getSortDirection());

  gKeyList = keyListObj.keyList;
  gKeySortList = keyListObj.keySortList;

  gUserList.currentItem = null;

  var treeChildren = gTreeChildren;

  var selectedItems=[];
  for (var i=0; i < gKeySortList.length; i++) {
    var keyId = gKeySortList[i].keyId;
    if (gSmgLastSelectedKeys && typeof(gSmgLastSelectedKeys[keyId]) != "undefined")
      selectedItems.push(i);
    var treeItem=null;
    treeItem=smgUserSelCreateRow(gKeyList[keyId], -1);
    treeItem.setAttribute("container", "true");
    var subChildren = document.createElement("treechildren");
    treeItem.appendChild(subChildren);
    var uidItem = document.createElement("treeitem");
    subChildren.appendChild(uidItem);
    var uidRow=document.createElement("treerow");
    var uidCell=document.createElement("treecell");
    uidCell.setAttribute("label", SmgGetString("keylist.noOtherUids"));
    uidRow.appendChild(uidCell);
    uidItem.appendChild(uidRow);
    uidItem.setAttribute("keytype", "none");
    uidItem.setAttribute("id", keyId);

    var uidChildren = document.createElement("treechildren");
    uidItem.appendChild(uidChildren);
    var uatItem = document.createElement("treeitem");
    uatItem.setAttribute("id", keyId);
    uatItem.setAttribute("keytype", "none");

    subChildren.appendChild(uatItem);
    var uatRow=document.createElement("treerow");
    var uatCell=document.createElement("treecell");
    uatCell.setAttribute("label", SmgGetString("keylist.noPhotos"));
    uatRow.appendChild(uatCell);
    uatItem.appendChild(uatRow);
    var uatChildren = document.createElement("treechildren");
    uatItem.appendChild(uatChildren);

    for (var subkey=0; subkey<gKeyList[keyId].SubUserIds.length; subkey++) {
      var subItem=smgUserSelCreateRow(gKeyList[keyId], subkey);
      if (gKeyList[keyId].SubUserIds[subkey].type == "uat") {
        uatItem.setAttribute("container", "true");
        uatCell.setAttribute("label", SmgGetString("keylist.hasPhotos"));
        uatChildren.appendChild(subItem);
        uatItem.setAttribute("open", "true");
      }
      else {
        uidItem.setAttribute("container", "true");
        uidCell.setAttribute("label", SmgGetString("keylist.hasOtherUids"));
        uidChildren.appendChild(subItem);
        uidItem.setAttribute("open", "true");
      }
    }
    if (treeItem)
      treeChildren.appendChild(treeItem);

  }

  // select last selected key
  if (selectedItems.length>0) {
    gUserList.view.selection.select(selectedItems[0]);
    for (i=1; i<selectedItems.length; i++) {
      gUserList.view.selection.rangedSelect(selectedItems[i], selectedItems[i], true);
    }
  }
  // gUserList.focus();
}


// create a (sub) row for the user tree
function smgUserSelCreateRow (keyObj, subKeyNum) {
    var expCol=document.createElement("treecell");
    var userCol=document.createElement("treecell");
    var keyCol=document.createElement("treecell");
    var typeCol=document.createElement("treecell");
    var validCol=document.createElement("treecell");
    var trustCol=document.createElement("treecell");
    var fprCol=document.createElement("treecell");
    var userRow=document.createElement("treerow");
    var treeItem=document.createElement("treeitem");

    userCol.setAttribute("id", "name");
    if (subKeyNum <0) {
      // primary key
      userCol.setAttribute("label", keyObj.userId);
      keyCol.setAttribute("label", keyObj.keyId.substr(-8,8));
      if (keyObj.secretAvailable) {
        typeCol.setAttribute("label", SmgGetString("keyType.publicAndSec"));
      }
      else {
        typeCol.setAttribute("label", SmgGetString("keyType.public"));
      }
      var keyTrust = keyObj.keyTrust;
      treeItem.setAttribute("keytype", "pub");
      fprCol.setAttribute("label",SmgFormatFpr(keyObj.fpr));
    }
    else {
      // secondary user id
      keyObj.SubUserIds[subKeyNum].userId = keyObj.SubUserIds[subKeyNum].userId;
      userCol.setAttribute("label", keyObj.SubUserIds[subKeyNum].userId);
      treeItem.setAttribute("keytype", keyObj.SubUserIds[subKeyNum].type);
      if (keyObj.SubUserIds[subKeyNum].type == "uid")
        treeItem.setAttribute("uidNum", subKeyNum);
      if (keyObj.SubUserIds[subKeyNum].type == "uat") {
        treeItem.setAttribute("uatNum", keyObj.SubUserIds[subKeyNum].uatNum);
      }
      keyCol.setAttribute("label", "");
      typeCol.setAttribute("label", "");
      keyTrust = keyObj.SubUserIds[subKeyNum].keyTrust;
    }
    var keyTrustLabel = SmgGetTrustLabel(keyTrust);

    var keyTrustStyle="";
    switch (keyTrust) {
    case 'q':
      keyTrustStyle="smaug_keyValid_unknown";
      break;
    case 'i':
      keyTrustStyle="smaug_keyValid_invalid";
      break;
    case 'd':
      keyTrustStyle="smaug_keyValid_disabled";
      break;
    case 'r':
      keyTrustStyle="smaug_keyValid_revoked";
      break;
    case 'e':
      keyTrustStyle="smaug_keyValid_expired";
      break;
    case 'n':
      keyTrustStyle="smaug_keyTrust_untrusted";
      break;
    case 'm':
      keyTrustStyle="smaug_keyTrust_marginal";
      break;
    case 'f':
      keyTrustStyle="smaug_keyTrust_full";
      break;
    case 'u':
      keyTrustStyle="smaug_keyTrust_ultimate";
      break;
    case '-':
    default:
      keyTrustStyle="smaug_keyTrust_unknown";
      break;
    }

    expCol.setAttribute("label", keyObj.expiry);
    expCol.setAttribute("id", "expiry");

    if (keyObj.keyUseFor.indexOf("D")>=0) {
      keyTrustLabel=SmgGetString("keyValid.disabled");
      keyTrustStyle="smaug_keyValid_disabled";
    }

    validCol.setAttribute("label", keyTrustLabel);
    validCol.setAttribute("properties", keyTrustStyle);

    trustCol.setAttribute("label", SmgGetTrustLabel(keyObj.ownerTrust));

    keyCol.setAttribute("id", "keyid");
    typeCol.setAttribute("id", "keyType");
    validCol.setAttribute("id", "keyValid");
    trustCol.setAttribute("id", "ownerTrust");

    userRow.appendChild(userCol);
    userRow.appendChild(keyCol);
    userRow.appendChild(typeCol);
    userRow.appendChild(validCol);
    userRow.appendChild(trustCol);
    userRow.appendChild(expCol);
    userRow.appendChild(fprCol);

    if ((keyTrust.length>0) &&
        (SMG_KEY_NOT_VALID.indexOf(keyTrust.charAt(0))>=0) ||
        (keyObj.keyUseFor.indexOf("D")>=0)) {
      for (var node=userRow.firstChild; node; node=node.nextSibling) {
        var attr=node.getAttribute("properties");
        if (typeof(attr)=="string") {
          node.setAttribute("properties", attr+" smgKeyInactive");
        }
        else {
          node.setAttribute("properties", "smgKeyInactive");
        }
      }
    }
    if (keyObj.secretAvailable && subKeyNum <0) {
      for (node=userRow.firstChild; node; node=node.nextSibling) {
        attr=node.getAttribute("properties");
        if (typeof(attr)=="string") {
          node.setAttribute("properties", attr+" smaugOwnKey");
        }
        else {
          node.setAttribute("properties", "smaugOwnKey");
        }
      }
    }
    treeItem.setAttribute("id", keyObj.keyId);
    treeItem.appendChild(userRow);
    return treeItem;
}


function smaugGetSelectedKeys() {

  var idList = new Array();
  var rangeCount = gUserList.view.selection.getRangeCount();
  for(var i=0; i<rangeCount; i++)
  {
    var start = {};
    var end = {};
    gUserList.view.selection.getRangeAt(i,start,end);
    for(var c=start.value; c<=end.value; c++)
    {
      try {
        idList.push(gUserList.view.getItemAtIndex(c).id);
      }
      catch(ex) {
        return [];
      }
    }
  }
  return idList;
}

function smaugKeyMenu() {
  var keyList = smaugGetSelectedKeys();
  if (keyList.length == 1 && gKeyList[keyList[0]].secretAvailable) {
    document.getElementById("bcRevoke").removeAttribute("disabled");
    document.getElementById("bcEditKey").removeAttribute("disabled");
  }
  else {
    document.getElementById("bcRevoke").setAttribute("disabled", "true");
    document.getElementById("bcEditKey").setAttribute("disabled", "true");
  }

  if (keyList.length == 1 && gKeyList[keyList[0]].photoAvailable) {
    document.getElementById("bcViewPhoto").removeAttribute("disabled");
  }
  else {
    document.getElementById("bcViewPhoto").setAttribute("disabled", "true");
  }

  if (smgGetClipboard().length > 0) {
    document.getElementById("bcClipbrd").removeAttribute("disabled");
  }
  else {
    document.getElementById("bcClipbrd").setAttribute("disabled", "true");
  }

  if (keyList.length >= 1) {
    document.getElementById("bcEnableKey").removeAttribute("disabled");
    if (gKeyList[keyList[0]].keyUseFor.indexOf("D")>0 ||
        gKeyList[keyList[0]].keyTrust.indexOf(SMG_KEY_DISABLED)>=0) {
      document.getElementById("bcEnableKey").setAttribute("label", SmgGetString("keyMan.enableKey"));
    }
    else {
      document.getElementById("bcEnableKey").setAttribute("label", SmgGetString("keyMan.disableKey"));
    }
  }

  if (keyList.length == 1) {
    document.getElementById("bcSignKey").removeAttribute("disabled");
    document.getElementById("bcViewSig").removeAttribute("disabled");
    document.getElementById("bcOneKey").removeAttribute("disabled");
    document.getElementById("bcDeleteKey").removeAttribute("disabled");
    document.getElementById("bcNoKey").removeAttribute("disabled");
  }
  else {
    if (keyList.length == 0) {
      document.getElementById("bcNoKey").setAttribute("disabled", "true");
      document.getElementById("bcEnableKey").setAttribute("disabled", "true");
    }
    else {
      document.getElementById("bcNoKey").removeAttribute("disabled");
    }
    document.getElementById("bcSignKey").setAttribute("disabled", "true");
    document.getElementById("bcViewSig").setAttribute("disabled", "true");
    document.getElementById("bcOneKey").setAttribute("disabled", "true");
    document.getElementById("bcDeleteKey").setAttribute("disabled", "true");
  }
}


function smaugOnClick(event) {
  if (event.detail != 2) {
    return;
  }

  // do not propagate double clicks
  event.stopPropagation();

  var keyList = smaugGetSelectedKeys();
  var keyType="";
  var uatNum="";
  if (keyList.length == 1) {
    var rangeCount = gUserList.view.selection.getRangeCount();
    var start = {};
    var end = {};
    gUserList.view.selection.getRangeAt(0,start,end);
    try {
      keyType = gUserList.view.getItemAtIndex(start.value).getAttribute("keytype");
      uatNum = gUserList.view.getItemAtIndex(start.value).getAttribute("uatNum");
    }
    catch(ex) {}
  }
  if (keyType=="uat") {
    smgShowSpecificPhoto(uatNum);
  }
  else {
   smaugKeyDetails();
  }
}

function smaugSelectAllKeys() {
  gUserList.view.selection.selectAll();
}

function smaugKeyDetails() {
  var keyList = smaugGetSelectedKeys();

  SmgDisplayKeyDetails(keyList[0], false);
}


function smaugDeleteKey() {
  var keyList = smaugGetSelectedKeys();
  var deleteSecret=false;

  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return;

  if (keyList.length == 1) {
    // one key selected
    var userId="0x"+keyList[0].substr(-8,8)+" - "+gKeyList[keyList[0]].userId;
    if(gKeyList[keyList[0]].secretAvailable) {
      if (!SmgConfirm(SmgGetString("deleteSecretKey", userId), SmgGetString("dlg.button.delete"))) return;
      deleteSecret=true;
    }
    else {
      if (!SmgConfirm(SmgGetString("deletePubKey", userId), SmgGetString("dlg.button.delete"))) return;
    }
  }
  else {
    // several keys selected
    for (var i=0; i<keyList.length; i++) {
      if (gKeyList[keyList[i]].secretAvailable) deleteSecret = true;
    }

    if (deleteSecret) {
      if (!SmgConfirm(SmgGetString("deleteMix"), SmgGetString("dlg.button.delete"))) return;
    }
    else {
      if (!SmgConfirm(SmgGetString("deleteSelectedPubKey"), SmgGetString("dlg.button.delete"))) return;
    }
  }

  SmaugKeyMgmt.deleteKey(window, "0x"+keyList.join(" 0x"), deleteSecret,
    function(exitCode, errorMsg) {
      if (exitCode != 0) {
        SmgAlert(SmgGetString("deleteKeyFailed")+"\n\n"+errorMsg);
        return;
      }
      smaugRefreshKeys();
    });
}


function smaugEnableKey() {
  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return;

  var keyList = smaugGetSelectedKeys();
  var disableKey = (gKeyList[keyList[0]].keyUseFor.indexOf("D")<0 &&
                     gKeyList[keyList[0]].keyTrust.indexOf(SMG_KEY_DISABLED)<0);

  var keyIndex = 0;
  function processNextKey() {
    SmaugKeyMgmt.enableDisableKey(window, "0x"+keyList[keyIndex], disableKey, function _enDisCb(exitCode, errorMsg) {
      if (exitCode == 0) {
        ++keyIndex;
        if (keyIndex < keyList.length) {
          processNextKey();
          return;
        }
        else {
          smaugRefreshKeys();
        }
      }
      else {
        SmgAlert(SmgGetString("enableKeyFailed")+"\n\n"+errorMsg);
        if (keyIndex > 0) smaugRefreshKeys();
      }
    });
  }

  processNextKey();
}

function smgShowPhoto() {

  var keyList = smaugGetSelectedKeys();
  var keyType="";
  var uatNum="";
  if (keyList.length == 1) {
    var rangeCount = gUserList.view.selection.getRangeCount();
    var start = {};
    var end = {};
    gUserList.view.selection.getRangeAt(0,start,end);
    try {
      keyType = gUserList.view.getItemAtIndex(start.value).getAttribute("keytype");
      uatNum = gUserList.view.getItemAtIndex(start.value).getAttribute("uatNum");
    }
    catch(ex) {}

    if (keyType=="uat") {
      smgShowSpecificPhoto(uatNum);
      return;
    }
  }

  smgShowSpecificPhoto(null);
}

function smgShowSpecificPhoto(uatNumber) {
  var keyList = smaugGetSelectedKeys();

  SmgShowPhoto(keyList[0], gKeyList[keyList[0]].userId, uatNumber);
}

function smaugAddPhoto() {
  var keyList = smaugGetSelectedKeys();
  keyMgrAddPhoto(gKeyList[keyList[0]].userId, keyList[0]);

}

function keyMgrAddPhoto(userId, keyId) {
  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return;

  var validFile=false;
  while (! validFile) {
    var inFile = SmgFilePicker(SmgGetString("keyMan.addphoto.filepicker.title"),
                                 "", false, "*.jpg",
                                 null,
                                 ["JPG", "*.jpg", "JPEG" , "*.jpeg"]);
    if (! inFile) return;

    var jpgHeader = SmgReadFileContents(inFile, 10);

    validFile = (jpgHeader.charCodeAt(0) == 0xFF &&
        jpgHeader.charCodeAt(1) == 0xD8 &&
        jpgHeader.substr(6,4) == "JFIF");

    if (! validFile) {
      SmgAlert(SmgGetString("keyMan.addphoto.noJpegFile"));
    }
  }

  if (inFile.fileSize> 25600) {
    // warn if file size > 25 kB
    if (!SmgConfirm(SmgGetString("keyMan.addphoto.warnLargeFile"), SmgGetString("dlg.button.continue"), SmgGetString("dlg.button.cancel")))
      return;
  }

  var ioServ = smgGetService(SMG_IOSERVICE_CONTRACTID, "nsIIOService");
  var photoUri = ioServ.newFileURI(inFile).spec;
  var argsObj = {
    photoUri: photoUri,
    userId: userId,
    keyId: keyId,
    okPressed: false
  };

  window.openDialog("chrome://smaug/content/smaugImportPhoto.xul", inFile, "chrome,modal=1,resizable=1,dialog=1,centerscreen", argsObj);

  if (!argsObj.okPressed) return;

  SmaugKeyMgmt.addPhoto(window, "0x"+keyId, inFile,
    function(exitCode, errorMsg) {
      if (exitCode != 0) {
        SmgAlert(SmgGetString("keyMan.addphoto.failed")+"\n\n"+errorMsg);
        return;
      }
      smaugRefreshKeys();
    });

}

function smgCreateKeyMsg() {
  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return;

  var keyList = smaugGetSelectedKeys();
  if (keyList.length==0) {
    SmgAlert(SmgGetString("noKeySelected"));
    return;
  }

  var tmpDir=SmgGetTempDir();

  try {
    var tmpFile = SCc[SMG_LOCAL_FILE_CONTRACTID].createInstance(SmgGetLocalFileApi());
    tmpFile.initWithPath(tmpDir);
    if (!(tmpFile.isDirectory() && tmpFile.isWritable())) {
      SmgAlert(SmgGetString("noTempDir"));
      return;
    }
  }
  catch (ex) {}
  tmpFile.append("key.asc");
  tmpFile.createUnique(SCi.nsIFile.NORMAL_FILE_TYPE, 0600);

  // save file
  var exitCodeObj= {};
  var errorMsgObj = {};
  smaugSvc.extractKey(window, 0, "0x"+keyList.join(" 0x"), tmpFile, exitCodeObj, errorMsgObj);
  if (exitCodeObj.value != 0) {
    SmgAlert(errorMsgObj.value);
    return;
  }

  // create attachment
  var ioServ = SCc[SMG_IOSERVICE_CONTRACTID].getService(SCi.nsIIOService);
  var tmpFileURI = ioServ.newFileURI(tmpFile);
  var keyAttachment = SCc["@mozilla.org/messengercompose/attachment;1"].createInstance(SCi.nsIMsgAttachment);
  keyAttachment.url = tmpFileURI.spec;
  if (keyList.length == 1) {
    keyAttachment.name = "0x"+keyList[0].substr(-8,8)+".asc";
  }
  else {
    keyAttachment.name = "pgpkeys.asc";
  }
  keyAttachment.temporary = true;
  keyAttachment.contentType = "application/pgp-keys";

  // create Msg
  var msgCompFields = SCc["@mozilla.org/messengercompose/composefields;1"].createInstance(SCi.nsIMsgCompFields);
  msgCompFields.addAttachment(keyAttachment);

  var acctManager = SCc["@mozilla.org/messenger/account-manager;1"].createInstance(SCi.nsIMsgAccountManager);

  var msgCompSvc = SCc["@mozilla.org/messengercompose;1"].getService(SCi.nsIMsgComposeService);

  var msgCompParam = SCc["@mozilla.org/messengercompose/composeparams;1"].createInstance(SCi.nsIMsgComposeParams);
  msgCompParam.composeFields = msgCompFields;
  msgCompParam.identity = acctManager.defaultAccount.defaultIdentity;
  msgCompParam.type = SCi.nsIMsgCompType.New;
  msgCompParam.format = SCi.nsIMsgCompFormat.Default;
  msgCompParam.originalMsgURI = "";
  msgCompSvc.OpenComposeWindowWithParams("", msgCompParam);
}

function createNewMail() {

  var keyList = smaugGetSelectedKeys();
  if (keyList.length==0) {
    SmgAlert(SmgGetString("noKeySelected"));
    return;
  }

  var addresses = [];
  var rangeCount = gUserList.view.selection.getRangeCount();
  var start = {};
  var end = {};
  var keyType, keyId, r, i;

  for (i=0; i < rangeCount; i++) {
    gUserList.view.selection.getRangeAt(i, start, end);

    for (r=start.value; r <= end.value; r++) {
      try {
        keyType = gUserList.view.getItemAtIndex(r).getAttribute("keytype");
        keyId = gUserList.view.getItemAtIndex(r).getAttribute("id");

        if (keyType == "uid") {
          var uidNum = Number(gUserList.view.getItemAtIndex(r).getAttribute("uidNum"));
          addresses.push(gKeyList[keyId].SubUserIds[uidNum].userId);
        }
        else
          addresses.push(gKeyList[keyId].userId);
      }
      catch(ex) {}
    }
  }

  // create Msg
  var msgCompFields = SCc["@mozilla.org/messengercompose/composefields;1"].createInstance(SCi.nsIMsgCompFields);
  msgCompFields.to = addresses.join(", ");

  var acctManager = SCc["@mozilla.org/messenger/account-manager;1"].createInstance(SCi.nsIMsgAccountManager);

  var msgCompSvc = SCc["@mozilla.org/messengercompose;1"].getService(SCi.nsIMsgComposeService);

  var msgCompParam = SCc["@mozilla.org/messengercompose/composeparams;1"].createInstance(SCi.nsIMsgComposeParams);
  msgCompParam.composeFields = msgCompFields;
  msgCompParam.identity = acctManager.defaultAccount.defaultIdentity;
  msgCompParam.type = SCi.nsIMsgCompType.New;
  msgCompParam.format = SCi.nsIMsgCompFormat.Default;
  msgCompParam.originalMsgURI = "";
  msgCompSvc.OpenComposeWindowWithParams("", msgCompParam);
}

function smgEditKeyTrust() {

  var keyList = smaugGetSelectedKeys();
  if (keyList.length==0) {
    SmgAlert(SmgGetString("noKeySelected"));
    return;
  }
  var userIdList = [];
  for (var i=0; i < keyList.length; i++) {
    userIdList.push(gKeyList[keyList[i]].userId);
  }

  if (SmgEditKeyTrust(userIdList, keyList)) {
    smaugRefreshKeys();
  }
}

function smgEditKeyExpiry() {

  var keyList = smaugGetSelectedKeys();
  if (keyList.length==0) {
    SmgAlert(SmgGetString("noKeySelected"));
    return;
  }
  var userIdList = [];
  for (var i=0; i < keyList.length; i++) {
    userIdList.push(gKeyList[keyList[i]].userId);
  }

  if (SmgEditKeyExpiry(userIdList, keyList)) {
    smaugRefreshKeys();
  }
}


function smgSignKey() {
  var keyList = smaugGetSelectedKeys();
  if (keyList.length==0) {
    SmgAlert(SmgGetString("noKeySelected"));
    return;
  }
  if (SmgSignKey(gKeyList[keyList[0]].userId, keyList[0], null)) {
    smaugRefreshKeys();
  }
}

function smaugRevokeKey() {
  var keyList = smaugGetSelectedKeys();
  SmgRevokeKey(keyList[0], gKeyList[keyList[0]].userId, function _revokeKeyCb(success) {
    if (success) smaugRefreshKeys();
  });
}

function smgCreateRevokeCert() {
  var keyList = smaugGetSelectedKeys();

  SmgCreateRevokeCert(keyList[0], gKeyList[keyList[0]].userId);
}


function smaugExportKeys() {
  var keyList = smaugGetSelectedKeys();
  if (keyList.length==0) {
    SmgAlert(SmgGetString("noKeySelected"));
    return;
  }

  // check whether we want to export a private key anywhere in the key list
  var secretFound = false;
  for (var i=0; i<keyList.length && !secretFound; ++i) {
    if (gKeyList[keyList[i]].secretAvailable) {
      secretFound = true;
    }
  }

  var exportFlags = 0;
  if (secretFound) {
    // double check that also the pivate keys shall be exportet
    var r=SmgLongAlert(SmgGetString("exportSecretKey"), null,
                        SmgGetString("keyMan.button.exportPubKey"),
                        SmgGetString("keyMan.button.exportSecKey"),
                        ":cancel");
    switch (r) {
      case 0: // export pub key only
        break;
      case 1: // export secret key
        exportFlags |= nsIEnigmail.EXTRACT_SECRET_KEY;
        break;
      case 2: // cancel
        return;
      }
  }

  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return;

  if (keyList.length==1) {

    var defaultFileName = gKeyList[keyList[0]].userId.replace(/[\<\>]/g, "");
    if (exportFlags & nsIEnigmail.EXTRACT_SECRET_KEY) {
      defaultFileName = SmgGetString("specificPubSecKeyFilename", defaultFileName, keyList[0].substr(-8,8))+".asc";
    }
    else {
      defaultFileName = SmgGetString("specificPubKeyFilename", defaultFileName, keyList[0].substr(-8,8))+".asc";
    }
  }
  else {
    if (exportFlags & nsIEnigmail.EXTRACT_SECRET_KEY) {
      defaultFileName = SmgGetString("defaultPubSecKeyFilename")+".asc";
    }
    else {
      defaultFileName = SmgGetString("defaultPubKeyFilename")+".asc";
    }
  }

  var outFile = SmgFilePicker(SmgGetString("exportToFile"),
                               "", true, "*.asc",
                               defaultFileName,
                               [SmgGetString("asciiArmorFile"), "*.asc"]);
  if (! outFile) return;

  var keyListStr = "0x"+keyList.join(" 0x");
  var exitCodeObj = {};
  var errorMsgObj = {};
  smaugSvc.extractKey(window, exportFlags, keyListStr, outFile, exitCodeObj, errorMsgObj);
  if (exitCodeObj.value != 0) {
    SmgAlert(SmgGetString("saveKeysFailed")+"\n\n"+errorMsgObj.value);
  }
  else {
    SmgAlert(SmgGetString("saveKeysOK"));
  }
}

function smaugImportKeysFromFile() {

  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return;

  var inFile = SmgFilePicker(SmgGetString("importKeyFile"),
                               "", false, "*.pem", "",
                               ["X.509 Certificate File", "*.pem;*.crt;*.p12"]);
  if (! inFile) return;

  DEBUG_LOG("smaugKeyManager.js GOT FILE NAME: " + inFile + "\n");

  var errorMsgObj = {};
  var keyListObj = {};
  DEBUG_LOG("smaugKeyManager.js IMPORTING: " + inFile + "\n");
  var exitCode = smaugSvc.importKeyFromFile(window, inFile, errorMsgObj, keyListObj);
  DEBUG_LOG("smaugKeyManager.js IMPORTED, exit code: " + exitCode + "\n");
  if (exitCode != 0) {
    SmgAlert(SmgGetString("importKeysFailed")+"\n\n"+errorMsgObj.value);
  }
  else {
    SmgLongAlert(SmgGetString("successKeyImport")+"\n\n"+errorMsgObj.value);
  }
  smaugRefreshKeys();
}


function smaugSearchKeys () {

  var inputObj = {
    searchList : ""
  };
  var resultObj = new Object();

  SmgDownloadKeys(inputObj, resultObj);

  if (resultObj.importedKeys > 0) {
    smaugRefreshKeys();
  }

}

function smaugListSig() {
  var keyList = smaugGetSelectedKeys();
  var inputObj = {
    keyId: keyList[0],
    keyListArr: gKeyList
  };
  var resultObj = {};

  window.openDialog("chrome://smaug/content/smaugViewKeySigDlg.xul",
        "", "chrome,dialog,modal,centerscreen,resizable=yes", inputObj, resultObj);

  if (resultObj.refresh) {
    smaugRefreshKeys();
  }

}

function smaugManageUids() {
  var keyList = smaugGetSelectedKeys();
  var inputObj = {
    keyId: keyList[0],
    ownKey: gKeyList[keyList[0]].secretAvailable
  };
  var resultObj = { refresh: false };
  window.openDialog("chrome://smaug/content/smaugManageUidDlg.xul",
        "", "dialog,modal,centerscreen,resizable=yes", inputObj, resultObj);
  if (resultObj.refresh) {
    smaugRefreshKeys();
  }
}

function smaugChangePwd() {
  var keyList = smaugGetSelectedKeys();
  SmgChangeKeyPwd(keyList[0], gKeyList[keyList[0]].userId);
}


function smgGetClipboard() {
  DEBUG_LOG("smaugKeyManager.js: smgGetClipboard:\n");
  var cBoardContent = "";
  var clipBoard = SCc[SMG_CLIPBOARD_CONTRACTID].getService(SCi.nsIClipboard);
  try {
    var transferable = SCc[SMG_TRANSFERABLE_CONTRACTID].createInstance(SCi.nsITransferable);
    transferable.addDataFlavor("text/unicode");
    clipBoard.getData(transferable, clipBoard.kGlobalClipboard);
    var flavour = {};
    var data = {};
    var length = {};
    transferable.getAnyTransferData(flavour, data, length);
    cBoardContent=data.value.QueryInterface(SCi.nsISupportsString).data;
    DEBUG_LOG("smaugKeyManager.js: smgGetClipboard: got data\n");
  }
  catch(ex) {}
  return cBoardContent;
}

function smaugImportFromClipbrd() {
  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return;

  if (!SmgConfirm(SmgGetString("importFromClip"), SmgGetString("keyMan.button.import"))) {
    return;
  }

  var cBoardContent = smgGetClipboard();
  var errorMsgObj = {};
  var r=smaugSvc.importKey(window, 0, cBoardContent, "", errorMsgObj);
  SmgLongAlert(errorMsgObj.value);
  smaugRefreshKeys();
}

function smaugCopyToClipbrd() {
  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return;

  var keyList = smaugGetSelectedKeys();
  if (keyList.length==0) {
    SmgAlert(SmgGetString("noKeySelected"));
    return;
  }
  var exitCodeObj={};
  var errorMsgObj={};
  var keyData = smaugSvc.extractKey(window, 0, "0x"+keyList.join(" 0x"), null, exitCodeObj, errorMsgObj);
  if (exitCodeObj.value != 0) {
    SmgAlert(SmgGetString("copyToClipbrdFailed")+"\n\n"+errorMsgObj.value);
    return;
  }
  var clipBoard = SCc[SMG_CLIPBOARD_CONTRACTID].getService(SCi.nsIClipboard);
  try {
    clipBoardHlp = SCc[SMG_CLIPBOARD_HELPER_CONTRACTID].getService(SCi.nsIClipboardHelper);
    clipBoardHlp.copyStringToClipboard(keyData, clipBoard.kGlobalClipboard);
    if (clipBoard.supportsSelectionClipboard()) {
      clipBoardHlp.copyStringToClipboard(keyData, clipBoard.kSelectionClipboard);
    }
    DEBUG_LOG("smaugKeyManager.js: smaugImportFromClipbrd: got data from clipboard");
    SmgAlert(SmgGetString("copyToClipbrdOK"));
  }
  catch(ex) {
    SmgAlert(SmgGetString("copyToClipbrdFailed"));
  }

}

function smaugSearchKey() {
  var inputObj = {
    searchList : null
  };
  var resultObj = new Object();

  SmgDownloadKeys(inputObj, resultObj);

  if (resultObj.importedKeys > 0) {
    smaugRefreshKeys();
  }
}


function smaugUploadKeys() {
  smaugKeyServerAcess(nsIEnigmail.UPLOAD_KEY, smaugUploadKeysCb);
}

function smaugUploadKeysCb(exitCode, errorMsg, msgBox) {
  if (msgBox) {
    if (exitCode!=0) {
      SmgLongAlert(SmgGetString("sendKeysFailed")+"\n"+errorMsg);
    }
  }
  else {
    return (SmgGetString(exitCode==0 ? "sendKeysOk" : "sendKeysFailed"));
  }
  return "";
}

function smaugReceiveKey() {
  smaugKeyServerAcess(nsIEnigmail.DOWNLOAD_KEY, smaugReceiveKeyCb);
}

function smaugRefreshAllKeys() {
  var checkedObj = {};
  var doIt=false;
  if (!SmgGetPref("warnRefreshAll")) {
    doIt=true;
  }
  else if (SmgLongAlert(SmgGetString("refreshKey.warn"), SmgGetString("dlgNoPrompt"),
      SmgGetString("dlg.button.continue"), ":cancel", null, checkedObj) == 0) {
      if (checkedObj.value) {
        SmgSetPref("warnRefreshAll", false);
      }
    doIt=true;
  }

  if (doIt) smaugKeyServerAcess(nsIEnigmail.REFRESH_KEY, smaugReceiveKeyCb);
}

// Iterate through contact emails and download them
function smaugDowloadContactKeysEngine() {
  let abManager = SCc["@mozilla.org/abmanager;1"].getService(SCi.nsIAbManager);

  let allAddressBooks = abManager.directories;
  let emails = new Array();

  while (allAddressBooks.hasMoreElements()) {
    let addressBook = allAddressBooks.getNext().QueryInterface(SCi.nsIAbDirectory);

    if (addressBook instanceof SCi.nsIAbDirectory) { // or nsIAbItem or nsIAbCollection
      // ask for confirmation for each address book:
      var doIt = SmaugCommon.confirmDlg(window,
                   SmgGetString("downloadContactsKeys.importFrom", addressBook.dirName),
                   SmgGetString("dlgYes"),
                   SmgGetString("dlg.button.skip"));
      if (!doIt) {
        continue;  // SKIP this address book
      }

      let allChildCards = addressBook.childCards;

      while (allChildCards.hasMoreElements()) {

        let card = allChildCards.getNext().QueryInterface(SCi.nsIAbCard);

        try {
          let email = card.getPropertyAsAString("PrimaryEmail");
          if (email && email.indexOf("@")>=0) {
            emails.push(email);
          }
        }
        catch (e) {}

        try {
          let email = card.getPropertyAsAString("SecondEmail");
          if (email && email.indexOf("@")>=0) {
            emails.push(email);
          }
        }
        catch (e) {}

      }
    }
  }

  // list of emails might be emoty here, in which case we do nothing
  if (emails.length <= 0) {
    return;
  }

  // sort the e-mail array
  emails.sort();

  //remove duplicates
  var i = 0;
  while (i<emails.length-1) {
    if (emails[i] == emails[i+1]) {
      emails.splice(i,1);
    }
    else {
      i = i + 1;
    }
  }

  var inputObj = {
    searchList : emails
  }
  var resultObj = new Object();

  SmaugFuncs.downloadKeys(window, inputObj, resultObj);

  if (resultObj.importedKeys > 0) {
    smaugRefreshKeys();
  }
}

function smaugDownloadContactKeys() {

  var doIt = SmaugCommon.confirmPref(window,
    SmgGetString("downloadContactsKeys.warn"),
    "warnDownloadContactKeys",
    SmgGetString("dlg.button.continue"),
    SmgGetString("dlg.button.cancel"));

  if (doIt) smaugDowloadContactKeysEngine();
}

function displayResult(arrayOfMsgText) {
  SmgLongAlert(arrayOfMsgText.join("\n"));
}

function smaugReceiveKeyCb(exitCode, errorMsg, msgBox) {
  DEBUG_LOG("smaugKeyManager.js: smaugReceiveKeyCb\n");
  if (msgBox) {
    if (exitCode==0) {
      smaugRefreshKeys();
      SmaugCommon.dispatchEvent(displayResult, 100, [ SmgGetString("receiveKeysOk"), errorMsg ]);
    }
    else {
      SmaugCommon.dispatchEvent(displayResult, 100, [ SmgGetString("receiveKeysFailed"), errorMsg ]);
    }
  }
  else {
    return (SmgGetString(exitCode==0 ? "receiveKeysOk" : "receiveKeysFailed"));
  }
  return "";
}


function addToPRRule() {
  var keyList = smaugGetSelectedKeys();
  if (keyList.length==0) {
    SmgAlert(SmgGetString("noKeySelected"));
    return;
  }

  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return;

  var inputObj = { keyId: keyList[0],
                   userId: gKeyList[keyList[0]].userId };
  window.openDialog("chrome://smaug/content/smaugSelectRule.xul",
        "", "dialog,modal,centerscreen", inputObj);

}


//
// ----- key filtering functionality  -----
//


function onSearchInput() {
   if (gSearchInput.value == "")
   {
     onResetFilter();
     return;
   }
   smgApplyFilter();
}

function getFirstNode() {
  return gTreeChildren.firstChild;
}

function onResetFilter() {
  gSearchInput.value="";
  showOrHideAllKeys();
}

function smaugToggleShowAll() {
  // gShowAllKeysElement.checked = (! gShowAllKeysElement.checked);
  SmgSetPref("keyManShowAllKeys", displayFullList());

  if (!gSearchInput.value || gSearchInput.value.length==0) {
    showOrHideAllKeys();
  }
}


function showOrHideAllKeys() {
  var hideNode = ! displayFullList();
  var initHint = document.getElementById("emptyTree");
  var showInvalidKeys = gShowInvalidKeys.getAttribute("checked") == "true";
  var showUntrustedKeys = gShowUntrustedKeys.getAttribute("checked") == "true";
  var showOthersKeys = gShowOthersKeys.getAttribute("checked") == "true";

  document.getElementById("nothingFound").hidePopup();
  if (hideNode) {
    initHint.showPopup(gTreeChildren, -1, -1, "tooltip", "after_end", "");
  }
  else {
    initHint.hidePopup();
  }
  var node=getFirstNode();
  while (node) {
    node.hidden = hideNode;
     if (! determineHiddenKeys(gKeyList[node.id], showInvalidKeys, showUntrustedKeys, showOthersKeys)) {
       node.hidden = true;
    }

    node = node.nextSibling;
  }
}

function determineHiddenKeys(keyObj, showInvalidKeys, showUntrustedKeys, showOthersKeys) {
  var show = true;

  const INVALID_KEYS = "ierdD";
  const UNTRUSTED_KEYS = "n-";

  if ((!showInvalidKeys) && INVALID_KEYS.indexOf(SmgGetTrustCode(keyObj))>=0) show = false;
  if ((!showUntrustedKeys) && UNTRUSTED_KEYS.indexOf(keyObj.ownerTrust)>=0) show = false;
  if ((!showOthersKeys) && (!keyObj.secretAvailable)) show = false;

  return show;
}

function smgApplyFilter()
{
  var searchTxt=gSearchInput.value;
  var nothingFoundElem = document.getElementById("nothingFound");
  nothingFoundElem.hidePopup();
  var showInvalidKeys = gShowInvalidKeys.getAttribute("checked") == "true";
  var showUntrustedKeys = gShowUntrustedKeys.getAttribute("checked") == "true";
  var showOthersKeys = gShowOthersKeys.getAttribute("checked") == "true";

  if (!searchTxt || searchTxt.length==0) {
    showOrHideAllKeys();
    return;
  }
  document.getElementById("emptyTree").hidePopup();

  // skip leading 0x in case we search for a key:
  if (searchTxt.length > 2 && searchTxt.substr(0,2).toLowerCase() == "0x") {
    searchTxt = searchTxt.substr(2);
  }

  searchTxt = searchTxt.toLowerCase();
  searchTxt = searchTxt.replace(/^(\s*)(.*)/, "$2").replace(/\s+$/,"");  // trim spaces

  // check if we search for a fingerprint 
  var fpr = null;
  if (searchTxt.length == 49) { // possible fingerprint with spaces? 
    if (searchTxt.search(/^[0-9a-f ]*$/)>=0 && searchTxt[4]==' ' && searchTxt[9]==' ' && searchTxt[14]==' '
                                            && searchTxt[19]==' ' && searchTxt[24]==' ' && searchTxt[29]==' '
                                            && searchTxt[34]==' ' && searchTxt[39]==' ' && searchTxt[44]==' ') {
      fpr = searchTxt.replace(/ /g,"");
    }
  }
  else if (searchTxt.length == 40) { // possible fingerprint without spaces
    if (searchTxt.search(/^[0-9a-f ]*$/)>=0) {
      fpr = searchTxt;
    }
  }

  var foundResult = false;
  var node=getFirstNode();
  while (node) {
    var uid = gKeyList[node.id].userId;
    var hideNode = true;
    if ((uid.toLowerCase().indexOf(searchTxt) >= 0) ||
        (node.id.toLowerCase().indexOf(searchTxt) >= 0)) {
       if (determineHiddenKeys(gKeyList[node.id], showInvalidKeys, showUntrustedKeys, showOthersKeys)) {
          hideNode = false;
          foundResult = true;
        }
    }
    if (hideNode==true && fpr != null && gKeyList[node.id].fpr.toLowerCase() == fpr) {
      hideNode = false;
      foundResult = true;
    }
    for (var subUid=0; hideNode==true && subUid < gKeyList[node.id].SubUserIds.length; subUid++) {
      uid = gKeyList[node.id].SubUserIds[subUid].userId;
      if (uid.toLowerCase().indexOf(searchTxt) >= 0) {
        hideNode = false;
        foundResult = true;
      }
      // ideally we should check also the sub-key-ids
    }
    node.hidden=hideNode;
    node = node.nextSibling;
  }

  if (! foundResult) {
    nothingFoundElem.showPopup(gTreeChildren, -1, -1, "tooltip", "after_end", "");
  }
}

//
// ----- keyserver related functionality ----
//
function smaugKeyServerAcess(accessType, callbackFunc) {

  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return;

  var resultObj = {};
  var inputObj = {};
  if (accessType == nsIEnigmail.UPLOAD_KEY) {
    inputObj.upload = true;
  }

  var selKeyList = smaugGetSelectedKeys();
  if (accessType != nsIEnigmail.REFRESH_KEY && selKeyList.length==0) {
    if (SmgConfirm(SmgGetString("refreshAllQuestion"), SmgGetString("keyMan.button.refreshAll"))) {
      accessType = nsIEnigmail.REFRESH_KEY;
      SmgAlertPref(SmgGetString("refreshKey.warn"), "warnRefreshAll");
    }
    else {
      return;
    }
  }

  if (accessType != nsIEnigmail.REFRESH_KEY) {
    var keyList=[];
    for (var i=0; i < selKeyList.length; i++) {
      keyList.push("0x"+selKeyList[i].substr(-8,8)+" - "+ gKeyList[selKeyList[i]].userId);
    }
    inputObj.keyId = keyList.join(", ");
  }
  else {
    inputObj.keyId = "";
  }

  window.openDialog("chrome://smaug/content/smaugKeyserverDlg.xul",
        "", "dialog,modal,centerscreen", inputObj, resultObj);
  if (! resultObj.value) {
    return;
  }

  var keyDlObj = {
    accessType: accessType,
    keyServer: resultObj.value,
    keyList: "0x"+selKeyList.join(" 0x"),
    cbFunc: callbackFunc
  };

  window.openDialog("chrome://smaug/content/smgRetrieveProgress.xul",
        "", "dialog,modal,centerscreen", keyDlObj, resultObj);

  if (accessType != nsIEnigmail.UPLOAD_KEY && resultObj.result) {
    smaugRefreshKeys();
  }
}

function getSortDirection() {
  return gUserList.getAttribute("sortDirection") == "ascending" ? 1 : -1;
}

function sortTree(column) {

  var columnName;
  var order = getSortDirection();

  //if the column is passed and it's already sorted by that column, reverse sort
  if (column) {
    columnName = column.id;
    if (gUserList.getAttribute("sortResource") == columnName) {
      order *= -1;
    }
    else {
      document.getElementById(gUserList.getAttribute("sortResource")).removeAttribute("sortDirection");
      order = 1;
    }
  } else {
    columnName = gUserList.getAttribute("sortResource");
  }
  gUserList.setAttribute("sortDirection", order == 1 ? "ascending" : "descending");
  gUserList.setAttribute("sortResource", columnName);
  document.getElementById(columnName).setAttribute("sortDirection", order == 1 ? "ascending" : "descending");
  smaugClearTree();
  smaugBuildList(false);
  smgApplyFilter();
}


function getSortColumn() {
  switch (gUserList.getAttribute("sortResource")) {
  case "smgUserNameCol": return "userid";
  case "keyCol": return "keyidshort";
  case "typeCol": return "keytype";
  case "validityCol": return "validity";
  case "trustCol": return "trust";  // ownerTrust
  case "expCol": return "expiry";
  case "fprCol": return "fpr";
  default: return "?";
  }
}

