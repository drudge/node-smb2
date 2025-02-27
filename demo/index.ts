// import runServer from "./runServer";
import runClient from "./runClient";

(async () => {
  const {
    HOST: host = "localhost",
    DOMAIN: domain = "domain",
    USERNAME: username = "test",
    PASSWORD: password = "1234",
    SHARE: share = "test",
    FORCE_NTLM: forceNtlm
  } = process.env;

  // Options for testing NTLMv1/v2 modes
  const forceNtlmVersion = forceNtlm === 'v1' ? 'v1' : 
                           forceNtlm === 'v2' ? 'v2' : 
                           undefined;

  // await runServer();
  await runClient(host, domain, username, password, share, forceNtlmVersion);
})();