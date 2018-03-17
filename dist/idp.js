require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({"/index.js":[function(require,module,exports){
const IdentityProvider	= require("./lib/IdentityProvider");

//Create an idp instance from datasttore
const idp = new IdentityProvider();

//Register identity provider on global RTCIdentityProviderRegistrar 
rtcIdentityProvider.register(idp);

},{"./lib/IdentityProvider":1}],1:[function(require,module,exports){
const idbKeyval = require('idb-keyval');

const domain	= "idp-proxy.ddns.net";
const protocol	= "idp.js";
const key	= "AIzaSyD7pVGgeD6rxg0lyp36_Z7Tv4lhxKfaD1E"; //ONly valid for idp-proxy.ddns.net domain

/*
 *  dictionary RTCIdentityProvider {
 *   required GenerateAssertionCallback generateAssertion;
 *   required ValidateAssertionCallback validateAssertion;
 *  };
 *  
 */
class IdentityProvider
{
	constructor()
	{
	}
	
	/*
	 * generateAssertion of type GenerateAssertionCallback, required
	 *	A user agent invokes this method on the IdP to request the generation of an identity assertion.
	 *	
	 *	The IdP provides a promise that resolves to an RTCIdentityAssertionResult to successfully generate 
	 *	an identity assertion. Any other value, or a rejected promise, is treated as an error.
	 *	
	 *	callback GenerateAssertionCallback = Promise<RTCIdentityAssertionResult> (DOMString contents, DOMString origin, RTCIdentityProviderOptions options);
	 *	
	 *		contents of type DOMString
	 *			The contents parameter includes the information that the user agent wants covered by the identity assertion.
	 *			The IdP must treat contents as opaque string. A successful validation of the provided assertion must produce the same string.
	 *			
	 *		origin of type DOMString
	 *			The origin parameter identifies the origin of the RTCPeerConnection that triggered this request.
	 *			An IdP can use this information as input to policy decisions about use.
	 *			This value is generated by the user agent based on the origin of the document that created the RTCPeerConnection and therefore can be trusted to be correct.
	 *			
	 *		options of type RTCIdentityProviderOptions
	 *			This includes the options provided by the application when calling setIdentityProvider.
	 *			Though the dictionary is an optional argument to setIdentityProvider, default values are used as necessary when passing the value to the identity provider; see the definition of RTCIdentityProviderOptions for details.
	 */
	async generateAssertion(contents, origin, options)
	{
		/*
		 *  dictionary RTCIdentityAssertionResult {
		 *   required RTCIdentityProviderDetails idp;		// An IdP provides these details to identify the IdP that validates the identity assertion. 
		 *							// This struct contains the same information that is provided to setIdentityProvider.
		 *   required DOMString                  assertion;	// An identity assertion.
		 *							// This is an opaque string that must contain all information necessary to assert identity.
		 *							// This value is consumed by the validating IdP.
		 * };
		 * 
		 * dictionary RTCIdentityProviderDetails {
		 *    required DOMString domain;			// The domain name of the IdP that validated the associated identity assertion.
		 *             DOMString protocol = "default";		// The protocol parameter used for the IdP.
		 *							// This attribute must contain only characters legal for inclusion in URIs [RFC3986].
		 * };
		 * 
		 */
		try {
			//Get token from indexed db storage
			const idToken	  = await idbKeyval.get("id_token");
			const accessToken = await idbKeyval.get("access_token");

			//Check if user is authenticated
			if (!idToken || !accessToken)
				//Create error
				throw {
					name: 'IdpLoginError',
					loginUrl: `https://${domain}/.well-known/idp-proxy/login.html`
				};
			
			//Create long assertion with the id token and the contents
			const long = JSON.stringify ({
				contents : contents,
				token	 : idToken
			});
			
			//Create an url shortener with the assertion so it is stored server side
			const url = await fetch("https://www.googleapis.com/urlshortener/v1/url",{
				method: "POST",
				headers: { 
					"Authorization" : "Bearer " + accessToken,
					"content-type"  : "application/json" 
				},
				body: JSON.stringify({
					longUrl : "https://"+domain+"/"+encodeURI(long)
				})
			});
			//Get assertion
			const shortened = await url.json();
			
			//Return assertion id
			return {
				idp : {
					domain   : domain,
					protocol : protocol
				},
				assertion : shortened.id
			};
		} catch (e) {
			//Create error
			throw {
				name: 'IdpLoginError',
				loginUrl: `https://${domain}/.well-known/idp-proxy/login.html`
			};
		}
	}
	
	/*
	 * validateAssertion of type ValidateAssertionCallback, required
	 * 	A user agent invokes this method on the IdP to request the validation of an identity assertion.
	 * 	
	 *	The IdP returns a Promise that resolves to an RTCIdentityValidationResult to successfully validate an identity assertion and to provide the actual identity.
	 *	Any other value, or a rejected promise, is treated as an error.
	 *	
	 *	callback ValidateAssertionCallback = Promise<RTCIdentityValidationResult> (DOMString assertion, DOMString origin);
	 *	
	 *		assertion of type DOMString
	 *			The assertion parameter includes the assertion that was recovered from an a=identity in the session description;
	 *			that is, the value that was part of the RTCIdentityAssertionResult provided by the IdP that generated the assertion.
	 *			
	 *		origin of type DOMString
	 *			The origin parameter identifies the origin of the RTCPeerConnection that triggered this request. An IdP can use this information as input to policy decisions about use.
	 */
	async validateAssertion(assertion, origin)
	{
		/*
		 * dictionary RTCIdentityValidationResult {
		 *    required DOMString identity;	// The validated identity of the peer.
		 *    required DOMString contents;	// The payload of the identity assertion.
		 *					//  An IdP that validates an identity assertion must return the same string that was provided to the original IdP that generated the assertion.
		 *					// The user agent uses the contents string to determine if the identity assertion matches the session description.
		 * };
		 */
		try {
			//Get long value
			const url = await fetch("https://content.googleapis.com/urlshortener/v1/url?key="+key+"&shortUrl="+ encodeURI(assertion.assertion));

			//Get response
			const json = await url.json();

			//Get expanded url
			const longUrl = new URL(json.longUrl);
			
			//Decode stored informaton on the generated assertion
			const generated = JSON.parse(decodeURI(longUrl.pathname).slice(1));

			//Validate token
			if (!generated || !generated.token)
				//Error
				throw new Error("idp-token-invalid");

			//Let google validate the token
			const tokeninfo = await fetch("https://www.googleapis.com/oauth2/v3/tokeninfo?id_token="+generated.token);

			//Get identity information associated to the token
			const identity = await tokeninfo.json();
			
			//Return asserted identity and origina contents
			return {
				identity : JSON.stringify (identity),
				contents : generated.contents
			};
		} catch (e) {
			//Create error
			throw new Error("idp-token-invalid");
		}
	}
};

module.exports = IdentityProvider;
},{"idb-keyval":2}],2:[function(require,module,exports){
'use strict';

var db;

function getDB() {
  if (!db) {
    db = new Promise(function(resolve, reject) {
      var openreq = indexedDB.open('keyval-store', 1);

      openreq.onerror = function() {
        reject(openreq.error);
      };

      openreq.onupgradeneeded = function() {
        // First time setup: create an empty object store
        openreq.result.createObjectStore('keyval');
      };

      openreq.onsuccess = function() {
        resolve(openreq.result);
      };
    });
  }
  return db;
}

function withStore(type, callback) {
  return getDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var transaction = db.transaction('keyval', type);
      transaction.oncomplete = function() {
        resolve();
      };
      transaction.onerror = function() {
        reject(transaction.error);
      };
      callback(transaction.objectStore('keyval'));
    });
  });
}

var idbKeyval = {
  get: function(key) {
    var req;
    return withStore('readonly', function(store) {
      req = store.get(key);
    }).then(function() {
      return req.result;
    });
  },
  set: function(key, value) {
    return withStore('readwrite', function(store) {
      store.put(value, key);
    });
  },
  delete: function(key) {
    return withStore('readwrite', function(store) {
      store.delete(key);
    });
  },
  clear: function() {
    return withStore('readwrite', function(store) {
      store.clear();
    });
  },
  keys: function() {
    var keys = [];
    return withStore('readonly', function(store) {
      // This would be store.getAllKeys(), but it isn't supported by Edge or Safari.
      // And openKeyCursor isn't supported by Safari.
      (store.openKeyCursor || store.openCursor).call(store).onsuccess = function() {
        if (!this.result) return;
        keys.push(this.result.key);
        this.result.continue();
      };
    }).then(function() {
      return keys;
    });
  }
};

module.exports = idbKeyval;

},{}]},{},["/index.js"]);
