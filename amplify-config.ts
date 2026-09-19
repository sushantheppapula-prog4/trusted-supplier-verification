import { Amplify } from "aws-amplify";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: "ap-south-1_S3dpK1Sf7",
      userPoolClientId: "qssp7vfvpaqprpmi1r01a7egj",
      loginWith: {
        oauth: {
          domain: "ap-south-1s3dpK1Sf7.auth.ap-south-1.amazoncognito.com",
          scopes: ["openid", "email"],
          redirectSignIn: ["http://localhost:3000/"],
          redirectSignOut: ["http://localhost:3000/"],
          responseType: "code",
        },
      },
    },
  },
});