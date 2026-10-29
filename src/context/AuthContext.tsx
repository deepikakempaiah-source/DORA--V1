import React, { createContext, useContext, useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth, googleProvider, githubProvider } from "../lib/firebase.js";

function requireAuth() {
  if (!auth) throw new Error("Firebase is not configured locally. Add the VITE_FIREBASE_* values to a .env file and restart the server.");
  return auth;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  provider: "google" | "github" | "email";
  verified: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithGithub: () => Promise<void>;
  loginWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapFirebaseUser(firebaseUser: FirebaseUser, providerHint?: "google" | "github" | "email"): UserProfile {
  const providerId = firebaseUser.providerData?.[0]?.providerId ?? "";
  let provider: "google" | "github" | "email" = providerHint ?? "email";

  if (providerId.includes("google")) provider = "google";
  else if (providerId.includes("github")) provider = "github";
  else if (providerHint) provider = providerHint;

  return {
    id: firebaseUser.uid,
    email: firebaseUser.email ?? "",
    name: firebaseUser.displayName ?? firebaseUser.email?.split("@")[0] ?? "Researcher",
    avatarUrl: firebaseUser.photoURL ?? undefined,
    provider,
    verified: firebaseUser.emailVerified || provider === "google" || provider === "github",
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Listen to Firebase auth state changes
  useEffect(() => {
    if (!auth) { setIsLoading(false); return; }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(mapFirebaseUser(firebaseUser));
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setIsLoading(true);
    try {
      const result = await signInWithPopup(requireAuth(), googleProvider);
      setUser(mapFirebaseUser(result.user, "google"));
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGithub = async () => {
    setIsLoading(true);
    try {
      const result = await signInWithPopup(requireAuth(), githubProvider);
      setUser(mapFirebaseUser(result.user, "github"));
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithEmail = async (email: string, password: string, _name?: string) => {
    setIsLoading(true);
    try {
      const result = await signInWithEmailAndPassword(requireAuth(), email, password);
      setUser(mapFirebaseUser(result.user, "email"));
    } finally {
      setIsLoading(false);
    }
  };

  const registerWithEmail = async (email: string, password: string, name: string) => {
    setIsLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(requireAuth(), email, password);
      // Update display name
      await updateProfile(result.user, { displayName: name });
      setUser(mapFirebaseUser(result.user, "email"));
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(requireAuth(), email);
  };

  const logout = async () => {
    await signOut(requireAuth());
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        loginWithGoogle,
        loginWithGithub,
        loginWithEmail,
        registerWithEmail,
        resetPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
