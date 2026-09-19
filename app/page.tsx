"use client";

import "aws-amplify/auth/enable-oauth-listener";

import { useEffect, useState } from "react";
import { getCurrentUser, signInWithRedirect, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

export default function Home() {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser.username);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUser();

    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect") {
        loadUser();
      }

      if (payload.event === "signInWithRedirect_failure") {
        console.error("COGNITO_FAILURE_RAW", payload.data);
        console.error(
          "COGNITO_FAILURE_JSON",
          JSON.stringify(payload.data, Object.getOwnPropertyNames(payload.data), 2)
        );
      }
    });

    return unsubscribe;
  }, []);

  const handleSignIn = async () => {
    await signInWithRedirect();
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl">
        <div className="mb-8">
          <p className="text-sm text-cyan-400 font-medium">
            AWS × WeMakeDevs
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Trusted Supplier Verification
          </h1>

          <p className="mt-3 text-slate-400">
            Verify supplier payment details before money leaves your business.
          </p>
        </div>

        {loading ? (
          <p className="text-slate-400">Checking authentication...</p>
        ) : user ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4">
              <p className="text-sm text-emerald-400">Signed in</p>
              <p className="mt-1 font-medium break-all">{user}</p>
            </div>

            <button
              onClick={handleSignOut}
              className="w-full rounded-xl bg-white px-5 py-3 font-semibold text-slate-950 hover:bg-slate-200"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            className="w-full rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-400"
          >
            Sign in with Cognito
          </button>
        )}
      </div>
    </main>
  );
}
