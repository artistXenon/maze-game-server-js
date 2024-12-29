import { startHTTP } from "./http";
import { startWS } from "./ws";

// try {JSON.parse(`23f456`)}catch(e) {console.error(e instanceof SyntaxError);}

startHTTP();
startWS();