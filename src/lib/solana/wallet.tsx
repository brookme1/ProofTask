import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Keypair, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { explainTxError, getBalance, requestDevnetAirdrop, sendWithSigner } from "./chain";

type Role = "creator" | "contributor" | "phantom";

type WalletContextValue = {
  ready: boolean;
  role: Role;
  setRole: (role: Role) => void;
  creator: Keypair | null;
  contributor: Keypair | null;
  phantom: PhantomWalletAdapter | null;
  phantomDetected: boolean;
  phantomConnected: boolean;
  activePublicKey: PublicKey | null;
  balance: number | null;
  balances: { creator: number | null; contributor: number | null; phantom: number | null };
  connectPhantom: () => Promise<void>;
  disconnectPhantom: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  airdropActive: () => Promise<string>;
  send: (instructions: TransactionInstruction[], memo: string) => Promise<string>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

const CREATOR_KEY = "prooftask.creator";
const CONTRIBUTOR_KEY = "prooftask.contributor";
const ROLE_KEY = "prooftask.role";

function loadKeypair(storageKey: string) {
  const existing = localStorage.getItem(storageKey);
  if (existing) {
    const bytes = Uint8Array.from(JSON.parse(existing) as number[]);
    return Keypair.fromSecretKey(bytes);
  }
  const created = Keypair.generate();
  localStorage.setItem(storageKey, JSON.stringify(Array.from(created.secretKey)));
  return created;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [role, setRoleState] = useState<Role>("creator");
  const [creator, setCreator] = useState<Keypair | null>(null);
  const [contributor, setContributor] = useState<Keypair | null>(null);
  const [phantom, setPhantom] = useState<PhantomWalletAdapter | null>(null);
  const [phantomDetected, setPhantomDetected] = useState(false);
  const [phantomConnected, setPhantomConnected] = useState(false);
  const [balances, setBalances] = useState<WalletContextValue["balances"]>({
    creator: null,
    contributor: null,
    phantom: null,
  });

  useEffect(() => {
    const creatorKey = loadKeypair(CREATOR_KEY);
    const contributorKey = loadKeypair(CONTRIBUTOR_KEY);
    const storedRole = localStorage.getItem(ROLE_KEY);
    setCreator(creatorKey);
    setContributor(contributorKey);
    if (storedRole === "creator" || storedRole === "contributor" || storedRole === "phantom") {
      setRoleState(storedRole);
    }
    const adapter = new PhantomWalletAdapter();
    setPhantom(adapter);
    setPhantomDetected(
      adapter.readyState === WalletReadyState.Installed ||
        adapter.readyState === WalletReadyState.Loadable,
    );
    const onConnect = () => setPhantomConnected(true);
    const onDisconnect = () => setPhantomConnected(false);
    adapter.on("connect", onConnect);
    adapter.on("disconnect", onDisconnect);
    void adapter.autoConnect().catch(() => undefined);
    setReady(true);
    return () => {
      adapter.off("connect", onConnect);
      adapter.off("disconnect", onDisconnect);
    };
  }, []);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    localStorage.setItem(ROLE_KEY, next);
  }, []);

  const refreshBalances = useCallback(async () => {
    const next = { creator: null as number | null, contributor: null as number | null, phantom: null as number | null };
    try {
      if (creator) next.creator = await getBalance(creator.publicKey);
    } catch {
      next.creator = null;
    }
    try {
      if (contributor) next.contributor = await getBalance(contributor.publicKey);
    } catch {
      next.contributor = null;
    }
    try {
      if (phantom?.publicKey) next.phantom = await getBalance(phantom.publicKey);
    } catch {
      next.phantom = null;
    }
    setBalances(next);
  }, [contributor, creator, phantom]);

  useEffect(() => {
    if (!ready) return;
    void refreshBalances();
    const timer = window.setInterval(() => void refreshBalances(), 20000);
    return () => window.clearInterval(timer);
  }, [ready, refreshBalances]);

  const activePublicKey = useMemo(() => {
    if (role === "phantom") return phantom?.publicKey ?? null;
    if (role === "contributor") return contributor?.publicKey ?? null;
    return creator?.publicKey ?? null;
  }, [contributor, creator, phantom, role]);

  const balance =
    role === "phantom" ? balances.phantom : role === "contributor" ? balances.contributor : balances.creator;

  const connectPhantom = useCallback(async () => {
    if (!phantom) throw new Error("Phantom is still loading");
    await phantom.connect();
    setPhantomConnected(true);
    setRole("phantom");
  }, [phantom, setRole]);

  const disconnectPhantom = useCallback(async () => {
    await phantom?.disconnect();
    setPhantomConnected(false);
    if (role === "phantom") setRole("creator");
  }, [phantom, role, setRole]);

  const airdropActive = useCallback(async () => {
    if (!activePublicKey) throw new Error("Choose a wallet first");
    const signature = await requestDevnetAirdrop(activePublicKey, 1);
    await refreshBalances();
    return signature;
  }, [activePublicKey, refreshBalances]);

  const send = useCallback(
    async (instructions: TransactionInstruction[], memo: string) => {
      if (!activePublicKey) throw new Error("Choose a wallet first");
      try {
        const signature = await sendWithSigner({
          payer: activePublicKey,
          instructions,
          memo,
          keypair: role === "creator" ? creator ?? undefined : role === "contributor" ? contributor ?? undefined : undefined,
          phantom: role === "phantom" ? phantom : null,
        });
        await refreshBalances();
        return signature;
      } catch (error) {
        throw new Error(await explainTxError(error));
      }
    },
    [activePublicKey, contributor, creator, phantom, refreshBalances, role],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      ready,
      role,
      setRole,
      creator,
      contributor,
      phantom,
      phantomDetected,
      phantomConnected,
      activePublicKey,
      balance,
      balances,
      connectPhantom,
      disconnectPhantom,
      refreshBalances,
      airdropActive,
      send,
    }),
    [
      activePublicKey,
      airdropActive,
      balance,
      balances,
      connectPhantom,
      contributor,
      creator,
      disconnectPhantom,
      phantom,
      phantomConnected,
      phantomDetected,
      ready,
      refreshBalances,
      role,
      send,
      setRole,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}
