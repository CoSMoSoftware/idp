const IdentityProvider	= require("./lib/IdentityProvider");

//Create an idp instance from datasttore
const idp = new IdentityProvider();

//Register identity provider on global RTCIdentityProviderRegistrar 
rtcIdentityProvider.register(idp);
