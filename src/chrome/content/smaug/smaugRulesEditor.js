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
 * Copyright (C) 2003 Patrick Brunschwig. All Rights Reserved.
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

// Initialize smaugCommon
SmgInitCommon("smaugRulesEditor");

const INPUT=0;
const RESULT=1;

var gSearchInput = null;
var gNumRows = null;

function smaugDlgOnLoad() {
  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return;

  var rulesListObj=new Object;
  if (smaugSvc.getRulesData(rulesListObj)) {
    var treeChildren=document.getElementById("rulesTreeChildren");
    var rulesList=rulesListObj.value;
    if (rulesList.firstChild.nodeName=="parsererror") {
      SmgAlert("Invalid pgprules.xml file:\n"+ rulesList.firstChild.textContent);
      return;
    }
    DEBUG_LOG("smaugRulesEditor.js: dlgOnLoad: keys loaded\n");
    gNumRows=0;
    var node=rulesList.firstChild.firstChild;
    while (node) {
      if (node.tagName=="pgpRule") {
        //try {
          var userObj={
                email: node.getAttribute("email"),
                keyId: node.getAttribute("keyId"),
                sign: node.getAttribute("sign"),
                encrypt: node.getAttribute("encrypt"),
                pgpMime: node.getAttribute("pgpMime"),
                negate: "0"
              };
          if (node.getAttribute("negateRule")) {
            userObj.negate=node.getAttribute("negateRule");
          }

          var treeItem=document.createElement("treeitem");
          createRow(treeItem, userObj);
          treeChildren.appendChild(treeItem);
        //}
        //catch (ex) {}
      }
      node = node.nextSibling;
    }
  }
  var rulesTree=document.getElementById("rulesTree");
  gSearchInput = document.getElementById("filterEmail");

}

function smaugDlgOnAccept() {
  DEBUG_LOG("smaugRulesEditor.js: dlgOnAccept:\n");
  var smaugSvc = GetSmaugSvc();
  if (!smaugSvc)
    return false;
  smaugSvc.clearRules();

  var node=getFirstNode();
  while(node) {
    smaugSvc.addRule(true,
                        node.getAttribute("email"),
                        node.getAttribute("keyId"),
                        node.getAttribute("sign"),
                        node.getAttribute("encrypt"),
                        node.getAttribute("pgpMime"),
                        node.getAttribute("negateRule")
                        );
    node = node.nextSibling;
  }
  smaugSvc.saveRulesFile();

  return true;
}

function createCol(value, label, treeItem, translate) {
  var column=document.createElement("treecell");
  column.setAttribute("id", value);
  treeItem.setAttribute(value, label);
  switch (value) {
  case "sign":
  case "encrypt":
  case "pgpMime":
    switch (Number(label)) {
    case 0:
      label=SmgGetString("never");
      break;
    case 1:
      label=SmgGetString("possible");
      break;
    case 2:
      label=SmgGetString("always");
      break;
    }
    break;
  case "keyId":
    if (label==".") {
      label=SmgGetString("nextRcpt");
    }
    break;
  case "negateRule":
    if (Number(label) == 1) {
      label=SmgGetString("negateRule");
    }
    else {
      label = "";
    }
  }
  column.setAttribute("label", label);
  return column;
}

function createRow(treeItem, userObj) {
  var negate=createCol("negateRule", userObj.negate, treeItem);
  var email=createCol("email", userObj.email, treeItem);
  var keyId=createCol("keyId", userObj.keyId, treeItem);
  var sign=createCol("sign", userObj.sign, treeItem);
  var encrypt=createCol("encrypt", userObj.encrypt, treeItem);
  var pgpMime=createCol("pgpMime", userObj.pgpMime, treeItem);
  var treeRow=document.createElement("treerow");
  treeRow.appendChild(negate);
  treeRow.appendChild(email);
  treeRow.appendChild(keyId);
  treeRow.appendChild(encrypt);
  treeRow.appendChild(sign);
  treeRow.appendChild(pgpMime);
  treeRow.setAttribute("rowId", ++gNumRows);

  if (treeItem.firstChild) {
    treeItem.replaceChild(treeRow, treeItem.firstChild);
  }
  else {
    treeItem.appendChild(treeRow);
  }
}

function getFirstNode() {
  return document.getElementById("rulesTreeChildren").firstChild;
}

function getCurrentNode() {
  var rulesTree=document.getElementById("rulesTree");
  return rulesTree.contentView.getItemAtIndex(rulesTree.currentIndex);
}


function smgDoEdit() {
  var node=getCurrentNode();
  if (node) {
    var inputObj  = new Object;
    var resultObj = new Object;
    inputObj.command = "edit";
    inputObj.options = "nosave";
    inputObj.toAddress = node.getAttribute("email");
    inputObj.keyId     = node.getAttribute("keyId").split(/[ ,]+/);
    inputObj.sign      = Number(node.getAttribute("sign"));
    inputObj.encrypt   = Number(node.getAttribute("encrypt"));
    inputObj.pgpmime   = Number(node.getAttribute("pgpMime"));
    inputObj.negate    = Number(node.getAttribute("negateRule"));

    window.openDialog("chrome://smaug/content/smaugSingleRcptSettings.xul","", "dialog,modal,centerscreen,resizable", inputObj, resultObj);
    if (resultObj.cancelled==false) {
      createRow(node, resultObj);
    }
  }
}

function smgDoAdd() {
  var inputObj  = new Object;
  var resultObj = new Object;
  inputObj.options = "nosave";
  inputObj.toAddress = "{}";
  inputObj.command = "add";

  window.openDialog("chrome://smaug/content/smaugSingleRcptSettings.xul","", "dialog,modal,centerscreen,resizable", inputObj, resultObj);
  if (resultObj.cancelled==false) {
    var treeItem=document.createElement("treeitem");
    createRow(treeItem, resultObj);
    var treeChildren=document.getElementById("rulesTreeChildren");
    if (treeChildren.firstChild) {
      treeChildren.insertBefore(treeItem, treeChildren.firstChild);
    }
    else {
      treeChildren.appendChild(treeItem);
    }
  }
}

function smgDoDelete() {
  var node=getCurrentNode();
  if (node) {
    if (SmgConfirm(SmgGetString("deleteRule"), SmgGetString("dlg.button.delete"))) {
      var treeChildren=document.getElementById("rulesTreeChildren");
      treeChildren.removeChild(node);
    }
  }
}

function smgDoMoveUp() {
  var node=getCurrentNode();
  if (! node) return;
  var prev=node.previousSibling;
  if (prev) {
    var rulesTree=document.getElementById("rulesTree");
    var currentIndex = rulesTree.currentIndex;
    var treeChildren=document.getElementById("rulesTreeChildren");
    var newNode=node.cloneNode(true);
    treeChildren.removeChild(node);
    treeChildren.insertBefore(newNode, prev);
    rulesTree.currentIndex = -1;
    rulesTree.currentIndex = currentIndex - 1;
  }
}

function smgDoMoveDown() {
  var node=getCurrentNode();
  if (! node) return;
  var nextNode=node.nextSibling;
  if (nextNode) {
    var rulesTree=document.getElementById("rulesTree");
    var currentIndex = rulesTree.currentIndex;
    var treeChildren=document.getElementById("rulesTreeChildren");
    var newNode=nextNode.cloneNode(true);
    treeChildren.removeChild(nextNode);
    treeChildren.insertBefore(newNode, node);
    rulesTree.currentIndex = currentIndex + 1;
  }
}

function smgDoSearch() {
  var searchTxt=document.getElementById("filterEmail").value;
  if (!searchTxt) return;
  searchTxt = searchTxt.toLowerCase();
  var node=getFirstNode();
  while (node) {
    if (node.getAttribute("email").toLowerCase().indexOf(searchTxt) <0) {
      node.hidden=true;
    }
    else {
      node.hidden=false;
    }
    node = node.nextSibling;
  }
}

function smgDoResetFilter() {
  document.getElementById("filterEmail").value="";
  var node=getFirstNode();
  while (node) {
    node.hidden=false;
    node = node.nextSibling;
  }
}

function onSearchInput()
{
   if (gSearchInput.value == "")
   {
     smgDoResetFilter();
     return;
   }

   smgDoSearch();
}

