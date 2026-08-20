import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider, useWalletModal } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';
import {
  AdminSettingsMode,
  type AdminSettings,
  type CompetitionState,
  type HistoryEntry,
  type LeaderboardEntry,
  type Token,
  SubmissionInputDirection,
  useGetAdminSettings,
  useGetCurrentCompetition,
  useGetMyHistory,
  useSubmitPaperRide,
  useSearchMarkets,
  useUpdateAdminSettings,
  getGetAdminSettingsQueryKey,
  getGetCurrentCompetitionQueryKey,
  getGetMyHistoryQueryKey,
  getSearchMarketsQueryKey,
} from '@workspace/api-client-react';
import { ArrowDownRight, ArrowUpRight, BarChart3, Check, ChevronRight, Clock3, Copy, Gauge, History, LockKeyhole, Menu, Plus, Radio, RefreshCw, Settings2, ShieldCheck, Trophy, WalletCards, X, Zap } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

type AdminMode = typeof AdminSettingsMode[keyof typeof AdminSettingsMode];

const queryClient = new QueryClient();

function formatPrice(price: number) {
  if (price < 0.01) return `$${price.toFixed(8)}`;
  if (price < 10) return `$${price.toFixed(3)}`;
  return `$${price.toFixed(2)}`;
}

function formatReturn(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function shortWallet(wallet: string) {
  if (wallet.length <= 13) return wallet;
  return `${wallet.slice(0, 5)}...${wallet.slice(-4)}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));
}

function useCountdown(closesAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = Math.max(0, (closesAt ? new Date(closesAt).getTime() : now) - now);
  const totalSeconds = Math.floor(remaining / 1000);
  return { minutes: Math.floor(totalSeconds / 60).toString().padStart(2, '0'), seconds: (totalSeconds % 60).toString().padStart(2, '0'), expired: remaining === 0 };
}

function useDebouncedValue(value: string, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debouncedValue;
}

function SolanaWalletProviders({ children }: { children: ReactNode }) {
  const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return <ConnectionProvider endpoint={endpoint}><WalletProvider wallets={wallets} autoConnect><WalletModalProvider>{children}</WalletModalProvider></WalletProvider></ConnectionProvider>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [walletError, setWalletError] = useState('');
  const { publicKey, disconnect, disconnecting } = useWallet();
  const { setVisible } = useWalletModal();
  const wallet = publicKey?.toBase58() ?? '';
  const isAdmin = location === '/admin';
  const connectWallet = async () => {
    setWalletError('');
    setVisible(true);
  };
  const disconnectWallet = async () => {
    setWalletError('');
    try {
      await disconnect();
    } catch {
      setWalletError('Wallet disconnect failed. Please try again.');
    }
  };
  return (
    <div className="min-h-[100dvh] bg-background paper-grid">
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--border)/.8)] bg-[hsl(var(--background)/.92)] backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1420px] items-center justify-between px-4 sm:px-6 lg:px-10">
          <div className="flex items-center gap-8">
            <Link href="/" data-testid="link-brand" className="group flex items-center gap-3 no-underline">
              <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-[10px] bg-[hsl(var(--accent))] text-[hsl(var(--secondary))] shadow-[4px_4px_0_hsl(var(--primary))] transition-transform group-hover:-translate-y-0.5">
                <Zap size={18} strokeWidth={2.8} />
              </span>
              <span className="display text-[20px] font-bold tracking-[-.04em] text-[hsl(var(--accent))]">paper<span className="text-[hsl(var(--primary))]">ride</span></span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
              <Link href="/" data-testid="link-arena" className={`rounded-lg px-3 py-2 text-[12px] font-bold uppercase tracking-[.13em] no-underline transition-colors ${!isAdmin ? 'bg-[hsl(var(--muted))] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Arena</Link>
              <Link href="/admin" data-testid="link-admin" className={`rounded-lg px-3 py-2 text-[12px] font-bold uppercase tracking-[.13em] no-underline transition-colors ${isAdmin ? 'bg-[hsl(var(--muted))] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Admin</Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 pr-3 text-[11px] font-semibold text-muted-foreground sm:flex">
              <span className="live-dot h-2 w-2 rounded-full bg-[hsl(var(--secondary))]" />
              Markets online
            </div>
            <button onClick={() => void (wallet ? disconnectWallet() : connectWallet())} disabled={disconnecting} data-testid="button-connect-wallet" className={`focus-ring flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[12px] font-extrabold tracking-wide transition-all active:translate-y-px disabled:opacity-60 ${wallet ? 'border-[hsl(var(--secondary)/.6)] bg-[hsl(var(--secondary)/.15)] text-[hsl(var(--accent))]' : 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--accent)/.92)]'}`}>
              <WalletCards size={15} />
              <span>{disconnecting ? 'Disconnecting…' : wallet ? shortWallet(wallet) : 'Connect wallet'}</span>
            </button>
            <button onClick={() => setMobileNav((value) => !value)} data-testid="button-toggle-navigation" className="focus-ring rounded-lg border border-transparent p-2 text-muted-foreground hover:bg-[hsl(var(--muted))] md:hidden" aria-label="Toggle navigation">
              {mobileNav ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>
        {mobileNav && (
          <nav className="border-t border-border px-4 py-3 md:hidden" aria-label="Mobile navigation">
            <Link href="/" onClick={() => setMobileNav(false)} data-testid="mobile-link-arena" className="block rounded-lg px-3 py-3 text-sm font-bold no-underline hover:bg-muted">Arena</Link>
            <Link href="/admin" onClick={() => setMobileNav(false)} data-testid="mobile-link-admin" className="block rounded-lg px-3 py-3 text-sm font-bold no-underline hover:bg-muted">Admin settings</Link>
          </nav>
        )}
        {walletError && <div role="alert" className="border-t border-[hsl(var(--primary)/.28)] bg-[hsl(var(--primary)/.08)] px-4 py-2 text-center text-xs text-[hsl(var(--primary))]">{walletError}</div>}
      </header>
      <main>{children}</main>
      <footer className="mx-auto flex max-w-[1420px] items-center justify-between px-4 py-8 text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground sm:px-6 lg:px-10">
        <span>PaperRide / Solana paper markets</span>
        <span className="flex items-center gap-1.5"><LockKeyhole size={11} /> No real funds at risk</span>
      </footer>
    </div>
  );
}

function SectionLabel({ children, detail }: { children: ReactNode; detail?: string }) {
  return <div className="mb-3 flex items-center justify-between"><h2 className="display text-[13px] font-bold uppercase tracking-[.16em] text-[hsl(var(--accent))]">{children}</h2>{detail && <span className="mono text-[10px] text-muted-foreground">{detail}</span>}</div>;
}

function StatusPill({ mode }: { mode: string }) {
  return <span data-testid="status-round-mode" className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--secondary)/.5)] bg-[hsl(var(--secondary)/.14)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.14em] text-[hsl(var(--accent))]"><span className="live-dot h-1.5 w-1.5 rounded-full bg-[hsl(var(--secondary))]" />{mode === 'TEST' ? 'Test round' : 'Production round'}</span>;
}

function TokenBadge({ symbol }: { symbol: string }) {
  return <span className="grid h-8 w-8 place-items-center rounded-lg bg-[hsl(var(--accent))] text-[10px] font-extrabold tracking-tight text-[hsl(var(--secondary))]">{symbol.slice(0, 3)}</span>;
}

function CompetitionPage() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const wallet = publicKey?.toBase58() ?? '';
  const connectWallet = async () => setVisible(true);
  const [marketQuery, setMarketQuery] = useState('');
  const [selectedMarket, setSelectedMarket] = useState<Token | null>(null);
  const [direction, setDirection] = useState<SubmissionInputDirection>(SubmissionInputDirection.LONG);
  const [confirmation, setConfirmation] = useState<CompetitionState['mySubmission']>(null);
  const [copied, setCopied] = useState(false);
  const [pricingError, setPricingError] = useState('');
  const queryClient = useQueryClient();
  const competitionParams = wallet ? { wallet } : undefined;
  const competitionQuery = useGetCurrentCompetition(competitionParams, {
    query: {
      queryKey: getGetCurrentCompetitionQueryKey(competitionParams),
      refetchInterval: 5_000,
      refetchOnWindowFocus: true,
    },
  });
  const historyParams = { wallet: wallet || 'wallet-not-connected' };
  const historyQuery = useGetMyHistory(historyParams, { query: { enabled: Boolean(wallet), queryKey: getGetMyHistoryQueryKey(historyParams) } });
  const debouncedMarketQuery = useDebouncedValue(marketQuery);
  const marketParams = { q: debouncedMarketQuery };
  const marketSearch = useSearchMarkets(
    marketParams,
    { query: { enabled: debouncedMarketQuery.trim().length >= 2, queryKey: getSearchMarketsQueryKey(marketParams) } },
  );
  const submitMutation = useSubmitPaperRide();
  const competition = competitionQuery.data;
  const history = historyQuery.data ?? [];
  const countdown = useCountdown(competition?.round.closesAt);
  const searchResults = marketSearch.data ?? [];
  const localSubmission = confirmation?.roundId === competition?.round.id ? confirmation : null;
  const mySubmission = localSubmission ?? competition?.mySubmission;
  const canSubmit = Boolean(
    wallet
      && selectedMarket
      && !countdown.expired
      && !submitMutation.isPending
      && !mySubmission,
  );

  useEffect(() => {
    if (confirmation && competition && confirmation.roundId !== competition.round.id) {
      setConfirmation(null);
    }
  }, [competition, confirmation]);

  if (!competition) {
    return <div className="mx-auto flex min-h-[65dvh] max-w-[1420px] items-center justify-center px-4"><div className="rounded-2xl border border-card-border bg-card px-6 py-8 text-center panel-shadow"><RefreshCw className="mx-auto mb-3 animate-spin text-[hsl(var(--primary))]" size={22} /><p className="font-bold">Opening the live round…</p>{competitionQuery.isError && <button onClick={() => void competitionQuery.refetch()} className="mt-3 text-xs font-bold text-[hsl(var(--primary))]">Retry live round</button>}</div></div>;
  }

  const handleSubmit = async () => {
    if (!wallet) {
      await connectWallet();
      return;
    }
    const activeWallet = wallet;
    if (!selectedMarket) return;
    setPricingError('');
    submitMutation.mutate({ data: { wallet: activeWallet, assetId: selectedMarket.assetId, direction } }, {
      onSuccess: (submission) => {
        setConfirmation(submission);
        void queryClient.invalidateQueries({ queryKey: getGetCurrentCompetitionQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetMyHistoryQueryKey({ wallet: activeWallet }) });
      },
      onError: (error) => setPricingError(error instanceof Error ? error.message : 'A live entry price is unavailable. Try again in a moment.'),
    });
  };
  const copyRound = () => {
    void navigator.clipboard?.writeText(competition.round.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="page-enter mx-auto max-w-[1420px] px-4 pb-12 pt-7 sm:px-6 lg:px-10 lg:pt-10">
      <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex items-center gap-3"><StatusPill mode={competition.round.mode} /><span className="mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Round {competition.round.id.replace('round-', '#')}</span><button onClick={copyRound} data-testid="button-copy-round-id" className="focus-ring text-muted-foreground hover:text-foreground" title="Copy round ID">{copied ? <Check size={13} /> : <Copy size={13} />}</button></div>
          <h1 data-testid="text-page-heading" className="display max-w-[680px] text-[clamp(2.4rem,6vw,5.2rem)] font-bold leading-[.92] tracking-[-.065em] text-[hsl(var(--accent))]">Make your<br /><span className="text-[hsl(var(--primary))]">paper ride.</span></h1>
          <p className="mt-4 max-w-[530px] text-sm leading-6 text-muted-foreground">One market. One call. The cleanest way to test your edge on Solana without putting capital on the line.</p>
        </div>
        <div className="flex items-end gap-5 border-l-2 border-[hsl(var(--primary))] pl-5 lg:mb-1">
          <div><div className="mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Closes in</div><div data-testid="text-countdown" className="display mt-1 text-4xl font-bold tracking-[-.07em] text-[hsl(var(--accent))]">{countdown.minutes}<span className="text-[hsl(var(--primary))]">:</span>{countdown.seconds}</div></div>
          <div className="pb-1"><div className="mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Riders in</div><div data-testid="text-participant-count" className="mt-1 text-lg font-extrabold text-[hsl(var(--accent))]">{competition.totalPlayers.toLocaleString()}</div></div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(350px,.8fr)]">
        <div className="space-y-6">
          <section className="panel-shadow-strong overflow-hidden rounded-2xl border border-[hsl(var(--card-border))] bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-7"><SectionLabel detail="live Solana pricing">Choose your market</SectionLabel><span className="hidden items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground sm:flex"><BarChart3 size={13} /> any mint</span></div>
            <div className="p-5 sm:p-7">
              <input value={marketQuery} onChange={(event) => { setMarketQuery(event.target.value); setPricingError(''); }} disabled={Boolean(mySubmission)} placeholder="Search name, symbol, or mint address" data-testid="input-market-search" className="focus-ring w-full rounded-xl border border-input bg-[hsl(var(--background)/.45)] px-4 py-3 text-sm outline-none placeholder:text-muted-foreground" />
              <p className="mt-2 text-[11px] text-muted-foreground">Only markets with a live, resolvable price can be selected.</p>
              {marketSearch.isFetching && <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw size={13} className="animate-spin" /> Searching live markets…</div>}
              {marketSearch.isError && <div className="mt-4 flex items-center justify-between rounded-lg bg-[hsl(var(--primary)/.08)] p-3 text-xs"><span>Pricing is temporarily unavailable.</span><button onClick={() => void marketSearch.refetch()} className="font-bold text-[hsl(var(--primary))]">Retry</button></div>}
              {marketQuery.trim().length >= 2 && !marketSearch.isFetching && !marketSearch.isError && searchResults.length === 0 && <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">No live Solana market matched that search.</p>}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {searchResults.map((token) => <button key={token.assetId} onClick={() => !mySubmission && setSelectedMarket(token)} disabled={Boolean(mySubmission)} data-testid={`button-token-${token.symbol.toLowerCase()}`} className={`focus-ring group flex items-center justify-between rounded-xl border p-4 text-left transition-all ${selectedMarket?.assetId === token.assetId ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)] shadow-[3px_3px_0_hsl(var(--primary)/.18)]' : 'border-border bg-[hsl(var(--background)/.28)] hover:border-[hsl(var(--accent)/.35)] hover:bg-muted'} disabled:cursor-not-allowed disabled:opacity-70`}>
                <span className="flex items-center gap-3"><TokenBadge symbol={token.symbol} /><span><span className="block text-sm font-extrabold text-[hsl(var(--accent))]">{token.symbol}</span><span className="block text-[11px] text-muted-foreground">{token.name}</span></span></span>
                <span className="text-right"><span className="mono block text-[12px] font-medium text-[hsl(var(--accent))]">{formatPrice(token.price)}</span><span className={`mono block text-[11px] font-medium ${token.change24h >= 0 ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--primary))]'}`}>{formatReturn(token.change24h)}</span></span>
              </button>)}
              </div>
            </div>
            <div className="mx-5 mb-5 rounded-xl bg-[hsl(var(--accent))] p-5 text-[hsl(var(--primary-foreground))] sm:mx-7 sm:mb-7">
              <div className="mb-5 flex items-center justify-between"><div><p className="mono text-[10px] uppercase tracking-[.18em] text-[hsl(var(--secondary)/.8)]">Your call</p><p className="mt-1 text-sm font-bold">{selectedMarket?.symbol ?? 'Search for a market'} / <span className="text-[hsl(var(--secondary))]">{direction}</span></p></div><Gauge size={21} className="text-[hsl(var(--secondary))]" /></div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setDirection(SubmissionInputDirection.LONG)} disabled={Boolean(mySubmission)} data-testid="button-direction-long" className={`focus-ring flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-[12px] font-extrabold transition-colors ${direction === 'LONG' ? 'border-[hsl(var(--secondary))] bg-[hsl(var(--secondary))] text-[hsl(var(--accent))]' : 'border-[hsl(var(--primary-foreground)/.22)] text-[hsl(var(--primary-foreground)/.72)] hover:border-[hsl(var(--secondary)/.6)]'}`}><ArrowUpRight size={16} /> LONG</button>
                <button onClick={() => setDirection(SubmissionInputDirection.SHORT)} disabled={Boolean(mySubmission)} data-testid="button-direction-short" className={`focus-ring flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-[12px] font-extrabold transition-colors ${direction === 'SHORT' ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'border-[hsl(var(--primary-foreground)/.22)] text-[hsl(var(--primary-foreground)/.72)] hover:border-[hsl(var(--primary)/.7)]'}`}><ArrowDownRight size={16} /> SHORT</button>
              </div>
              <button onClick={() => void (wallet ? handleSubmit() : connectWallet())} disabled={wallet ? !canSubmit : countdown.expired || Boolean(mySubmission) || !selectedMarket} data-testid="button-submit-ride" className="focus-ring mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 py-3.5 text-[13px] font-extrabold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">{submitMutation.isPending ? <RefreshCw size={16} className="animate-spin" /> : mySubmission ? <Check size={16} /> : <Zap size={16} />}{mySubmission ? 'Ride locked in' : !selectedMarket ? 'Select a live market' : wallet ? 'Submit immutable ride' : 'Connect wallet to ride'}</button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] text-[hsl(var(--primary-foreground)/.58)]"><ShieldCheck size={12} /> One submission per round · entry price is captured now</p>
              {pricingError && <p data-testid="status-pricing-unavailable" className="mt-3 rounded-lg bg-[hsl(var(--primary-foreground)/.12)] px-3 py-2 text-center text-[11px] text-[hsl(var(--primary-foreground)/.9)]">{pricingError}</p>}
            </div>
          </section>

          {mySubmission && <section data-testid="panel-submission-confirmation" className="page-enter rounded-2xl border-2 border-[hsl(var(--secondary))] bg-[hsl(var(--secondary)/.18)] p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--accent))]"><Check size={18} strokeWidth={3} /></span><div><p className="display text-lg font-bold text-[hsl(var(--accent))]">Ride locked.</p><p className="mt-1 text-sm leading-5 text-muted-foreground">Your paper position is immutable until this round resolves.</p></div></div><button onClick={() => setConfirmation(null)} data-testid="button-dismiss-confirmation" className="text-muted-foreground hover:text-foreground" aria-label="Dismiss confirmation"><X size={16} /></button></div><div className="mt-5 grid grid-cols-3 gap-3 border-t border-[hsl(var(--secondary)/.28)] pt-4"><div><p className="mono text-[9px] uppercase tracking-wider text-muted-foreground">Market</p><p className="mt-1 text-sm font-extrabold">{mySubmission.tokenSymbol}</p></div><div><p className="mono text-[9px] uppercase tracking-wider text-muted-foreground">Direction</p><p className={`mt-1 text-sm font-extrabold ${mySubmission.direction === 'LONG' ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--primary))]'}`}>{mySubmission.direction}</p></div><div><p className="mono text-[9px] uppercase tracking-wider text-muted-foreground">Entry</p><p className="mono mt-1 text-sm font-medium">{formatPrice(mySubmission.entryPrice)}</p></div></div></section>}

          <HistoryPanel history={history} loading={historyQuery.isLoading} error={Boolean(historyQuery.isError)} onRetry={() => void historyQuery.refetch()} />
        </div>
        <Leaderboard entries={competition.leaderboard} totalPlayers={competition.totalPlayers} />
      </div>
    </div>
  );
}

function Leaderboard({ entries, totalPlayers }: { entries: LeaderboardEntry[]; totalPlayers: number }) {
  return <section className="panel-shadow overflow-hidden rounded-2xl border border-card-border bg-card lg:sticky lg:top-[96px] lg:self-start"><div className="border-b border-border px-5 py-4 sm:px-6"><SectionLabel detail={`${totalPlayers} total`}>Signed-return board</SectionLabel><p className="text-xs text-muted-foreground">Rankings settle when the round resolves.</p></div><div className="p-2 sm:p-3">{entries.length === 0 ? <div data-testid="status-leaderboard-empty" className="px-4 py-14 text-center text-sm text-muted-foreground"><Trophy className="mx-auto mb-3 text-[hsl(var(--secondary))]" size={24} /><p>No signed rides yet.</p><p className="mt-1 text-xs">Be the first call on the board.</p></div> : entries.map((entry, index) => <div key={`${entry.wallet}-${entry.rank}`} data-testid={`row-leaderboard-${entry.rank}`} className={`group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors ${entry.isMe ? 'my-1 bg-[hsl(var(--primary)/.11)] ring-1 ring-[hsl(var(--primary)/.32)]' : 'hover:bg-muted'}`}><span className={`display w-5 text-center text-sm font-bold ${entry.rank <= 3 ? 'text-[hsl(var(--primary))]' : 'text-muted-foreground'}`}>{entry.rank}</span><span className={`grid h-8 w-8 place-items-center rounded-full text-[10px] font-extrabold ${entry.rank === 1 ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--accent))]' : 'bg-[hsl(var(--accent)/.1)] text-[hsl(var(--accent))]'}`}>{entry.wallet.slice(0, 2)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-extrabold text-[hsl(var(--accent))]">{entry.isMe ? 'You' : shortWallet(entry.wallet)}</span><span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground"><span>{entry.tokenSymbol}</span><span className={entry.direction === 'LONG' ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--primary))]'}>{entry.direction}</span></span></span><span className={`mono text-[12px] font-medium ${entry.returnPct >= 0 ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--primary))]'}`}>{formatReturn(entry.returnPct)}</span>{index === 0 && <Trophy size={14} className="text-[hsl(var(--primary))]" />}</div>)}</div><div className="border-t border-border px-6 py-3 text-[10px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><LockKeyhole size={11} /> Wallets are abbreviated for privacy</span></div></section>;
}

function HistoryPanel({ history, loading, error, onRetry }: { history: HistoryEntry[]; loading: boolean; error: boolean; onRetry: () => void }) {
  return <section className="rounded-2xl border border-card-border bg-card p-5 sm:p-7"><SectionLabel detail="Your signed rides">Personal history</SectionLabel>{loading ? <div data-testid="status-history-loading" className="space-y-3 py-3"><div className="h-12 animate-pulse rounded-lg bg-muted" /><div className="h-12 animate-pulse rounded-lg bg-muted" /></div> : error ? <div data-testid="status-history-error" className="flex items-center justify-between rounded-lg bg-[hsl(var(--primary)/.08)] p-4 text-xs"><span>History is temporarily unavailable.</span><button onClick={onRetry} data-testid="button-retry-history" className="font-bold text-[hsl(var(--primary))]">Retry</button></div> : history.length === 0 ? <div data-testid="status-history-empty" className="rounded-xl border border-dashed border-border px-4 py-9 text-center"><History className="mx-auto mb-3 text-muted-foreground" size={24} /><p className="text-sm font-bold">Your first ride is waiting.</p><p className="mt-1 text-xs text-muted-foreground">Past calls and their signed returns will land here.</p></div> : <div className="overflow-x-auto"><div className="min-w-[500px]"><div className="grid grid-cols-[1.3fr_1fr_1fr_1fr] gap-3 border-b border-border px-2 pb-2 text-[9px] font-bold uppercase tracking-[.14em] text-muted-foreground"><span>Round</span><span>Market</span><span>Call</span><span className="text-right">Return</span></div>{history.map((entry) => <div key={entry.roundId} data-testid={`row-history-${entry.roundId}`} className="grid grid-cols-[1.3fr_1fr_1fr_1fr] items-center gap-3 border-b border-border/70 px-2 py-3.5 text-xs last:border-0"><span><span className="mono block text-[11px] font-medium">#{entry.roundId.replace('round-', '')}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{formatDate(entry.date)}</span></span><span className="font-extrabold">{entry.tokenSymbol}</span><span className={`font-bold ${entry.direction === 'LONG' ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--primary))]'}`}>{entry.direction}</span><span className={`mono text-right font-medium ${entry.returnPct >= 0 ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--primary))]'}`}>{entry.status === 'PENDING' ? 'Pending' : formatReturn(entry.returnPct)}</span></div>)}</div></div>}</section>;
}

/* Legacy admin controls retained for reference.
function AdminPage() {
  const settingsQuery = useGetAdminSettings();
  const updateMutation = useUpdateAdminSettings();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AdminMode>(AdminSettingsMode.TEST);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [mintInput, setMintInput] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  useEffect(() => {
    if (settingsQuery.data) {
      setMode(settingsQuery.data.mode);
      setAssetIds(settingsQuery.data.tokens.map((token) => token.assetId));
    }
  }, [settingsQuery.data]);

  const addMint = () => {
    const mint = mintInput.trim();
    const assetId = mint.startsWith('solana:') ? mint : `solana:${mint}`;
    if (!mint || assetIds.includes(assetId)) return;
    setAssetIds((current) => [...current, assetId]);
    setMintInput('');
  };
  const removeMint = (assetId: string) => setAssetIds((current) => current.filter((currentAssetId) => currentAssetId !== assetId));
  const saveSettings = () => {
    updateMutation.mutate({ data: { mode, tokenMints: assetIds } }, {
      onSuccess: (next) => {
        setMode(next.mode);
        setAssetIds(next.tokens.map((token) => token.assetId));
        setSaveMessage('Settings synced to the competition engine.');
        void queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
      },
      onError: () => setSaveMessage('Demo settings saved locally. Connect the admin API to publish changes.'),
    });
  };

  return <div className="page-enter mx-auto max-w-[1100px] px-4 pb-12 pt-8 sm:px-6 lg:px-10 lg:pt-12"><div className="mb-9 max-w-[650px]"><div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-[hsl(var(--primary))]"><Settings2 size={14} /> Control room</div><h1 data-testid="text-admin-heading" className="display text-[clamp(2.4rem,6vw,4.8rem)] font-bold leading-[.94] tracking-[-.065em] text-[hsl(var(--accent))]">Set the <span className="text-[hsl(var(--primary))]">tempo.</span></h1><p className="mt-4 max-w-[520px] text-sm leading-6 text-muted-foreground">Choose the pace of the arena. Players can ride any market with a reliable live price.</p></div>{settingsQuery.isLoading && <div data-testid="status-admin-loading" className="mb-5 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Loading competition settings…</div>}<div className="grid gap-6 md:grid-cols-[1fr_1.25fr]"><section className="rounded-2xl border border-card-border bg-card p-5 panel-shadow sm:p-7"><SectionLabel>Round mode</SectionLabel><p className="mb-5 text-xs leading-5 text-muted-foreground">Test mode is useful for live demos. Production gives players a full hour to make their call.</p><div className="space-y-3"><button onClick={() => setMode(AdminSettingsMode.TEST)} data-testid="button-mode-test" className={`focus-ring w-full rounded-xl border p-4 text-left transition-colors ${mode === AdminSettingsMode.TEST ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)]' : 'border-border hover:bg-muted'}`}><div className="flex items-center justify-between"><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[hsl(var(--secondary)/.25)] text-[hsl(var(--accent))]"><Clock3 size={17} /></span><span><span className="block text-sm font-extrabold">TEST</span><span className="block text-[11px] text-muted-foreground">5 minute rounds</span></span></span>{mode === AdminSettingsMode.TEST && <Check size={17} className="text-[hsl(var(--primary))]" />}</div></button><button onClick={() => setMode(AdminSettingsMode.PRODUCTION)} data-testid="button-mode-production" className={`focus-ring w-full rounded-xl border p-4 text-left transition-colors ${mode === AdminSettingsMode.PRODUCTION ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)]' : 'border-border hover:bg-muted'}`}><div className="flex items-center justify-between"><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[hsl(var(--accent)/.1)] text-[hsl(var(--accent))]"><Radio size={17} /></span><span><span className="block text-sm font-extrabold">PRODUCTION</span><span className="block text-[11px] text-muted-foreground">1 hour rounds</span></span></span>{mode === AdminSettingsMode.PRODUCTION && <Check size={17} className="text-[hsl(var(--primary))]" />}</div></button></div></section><section className="rounded-2xl border border-card-border bg-card p-5 panel-shadow sm:p-7"><div className="flex items-start justify-between gap-4"><SectionLabel detail={`${assetIds.length} pinned`}>Tracked asset IDs</SectionLabel><span className="rounded-md bg-muted px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Optional</span></div><p className="mb-5 text-xs leading-5 text-muted-foreground">These are saved for quick administration only; live-price availability remains the eligibility rule.</p><div className="mb-4 flex gap-2"><input value={mintInput} onChange={(event) => setMintInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addMint(); }} data-testid="input-token-mint" placeholder="Paste a Solana mint or asset ID" className="focus-ring min-w-0 flex-1 rounded-lg border border-input bg-[hsl(var(--background)/.45)] px-3 py-2.5 text-xs outline-none placeholder:text-muted-foreground" /><button onClick={addMint} data-testid="button-add-token-mint" className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--accent)/.9)]" aria-label="Add tracked asset"><Plus size={17} /></button></div><div className="space-y-2">{assetIds.map((assetId) => <div key={assetId} className="flex items-center gap-3 rounded-lg border border-border bg-[hsl(var(--background)/.25)] p-3"><TokenBadge symbol="SOL" /><div className="min-w-0 flex-1"><p className="text-xs font-extrabold">Solana market</p><p className="mono mt-1 truncate text-[9px] text-muted-foreground">{assetId}</p></div><button onClick={() => removeMint(assetId)} className="focus-ring rounded-md p-1.5 text-muted-foreground hover:bg-[hsl(var(--primary)/.12)] hover:text-[hsl(var(--primary))] aria-label={`Remove ${assetId}`}><X size={15} /></button></div>)}</div></section></div><div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-[hsl(var(--accent)/.16)] bg-[hsl(var(--accent))] p-5 text-[hsl(var(--primary-foreground))] sm:flex-row sm:items-center sm:p-6"><div><p className="display font-bold">Ready to publish?</p><p className="mt-1 text-xs text-[hsl(var(--primary-foreground)/.62)]">New settings take effect when the next round opens.</p>{saveMessage && <p data-testid="status-admin-save" className="mt-2 text-xs font-bold text-[hsl(var(--secondary))]">{saveMessage}</p>}</div><button onClick={saveSettings} disabled={updateMutation.isPending} data-testid="button-save-admin-settings" className="focus-ring flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-5 py-3 text-xs font-extrabold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60">{updateMutation.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}Save settings<ChevronRight size={15} /></button></div></div>;
}

*/

function AdminPage() {
  const settingsQuery = useGetAdminSettings();
  const updateMutation = useUpdateAdminSettings();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AdminMode>(AdminSettingsMode.TEST);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [assetInput, setAssetInput] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (settingsQuery.data) {
      setMode(settingsQuery.data.mode);
      setAssetIds(settingsQuery.data.tokens.map((token) => token.assetId));
    }
  }, [settingsQuery.data]);

  const addAsset = () => {
    const raw = assetInput.trim();
    if (!raw) return;
    const assetId = raw.startsWith('solana:') ? raw : `solana:${raw}`;
    if (!assetIds.includes(assetId)) setAssetIds((current) => [...current, assetId]);
    setAssetInput('');
  };

  const saveSettings = () => {
    updateMutation.mutate({ data: { mode, tokenMints: assetIds } }, {
      onSuccess: (next) => {
        setAssetIds(next.tokens.map((token) => token.assetId));
        setSaveMessage('Settings synced to the competition engine.');
        void queryClient.invalidateQueries({ queryKey: getGetAdminSettingsQueryKey() });
      },
      onError: () => setSaveMessage('Settings could not be saved. Retry when the API is available.'),
    });
  };

  return (
    <div className="page-enter mx-auto max-w-[1100px] px-4 pb-12 pt-8 sm:px-6 lg:px-10 lg:pt-12">
      <div className="mb-9 max-w-[650px]">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-[hsl(var(--primary))]"><Settings2 size={14} /> Control room</div>
        <h1 className="display text-[clamp(2.4rem,6vw,4.8rem)] font-bold leading-[.94] tracking-[-.065em] text-[hsl(var(--accent))]">Set the <span className="text-[hsl(var(--primary))]">tempo.</span></h1>
        <p className="mt-4 max-w-[520px] text-sm leading-6 text-muted-foreground">Round cadence is the control. Any market with a reliable live price is eligible.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-card-border bg-card p-5 panel-shadow sm:p-7">
          <SectionLabel>Round mode</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {([AdminSettingsMode.TEST, AdminSettingsMode.PRODUCTION] as const).map((option) => (
              <button key={option} onClick={() => setMode(option)} className={`focus-ring rounded-xl border p-4 text-left ${mode === option ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary)/.08)]' : 'border-border hover:bg-muted'}`}>
                <p className="font-extrabold">{option}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{option === AdminSettingsMode.TEST ? '5 minute rounds' : '1 hour rounds'}</p>
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-card-border bg-card p-5 panel-shadow sm:p-7">
          <SectionLabel detail={`${assetIds.length} pinned`}>Tracked market IDs</SectionLabel>
          <p className="mb-4 text-xs leading-5 text-muted-foreground">Optional references for the control room. They do not restrict live market selection.</p>
          <div className="flex gap-2">
            <input value={assetInput} onChange={(event) => setAssetInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addAsset(); }} placeholder="Paste a Solana mint" className="focus-ring min-w-0 flex-1 rounded-lg border border-input bg-[hsl(var(--background)/.45)] px-3 py-2.5 text-xs outline-none" />
            <button onClick={addAsset} className="focus-ring grid h-10 w-10 place-items-center rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--primary-foreground))]" aria-label="Add asset"><Plus size={17} /></button>
          </div>
          <div className="mt-4 space-y-2">
            {assetIds.map((assetId) => <div key={assetId} className="flex items-center gap-3 rounded-lg border border-border p-3"><TokenBadge symbol="SOL" /><span className="mono min-w-0 flex-1 truncate text-[10px]">{assetId}</span><button onClick={() => setAssetIds((current) => current.filter((value) => value !== assetId))} className="text-muted-foreground hover:text-[hsl(var(--primary))]" aria-label={`Remove ${assetId}`}><X size={15} /></button></div>)}
          </div>
        </section>
      </div>
      <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl bg-[hsl(var(--accent))] p-5 text-[hsl(var(--primary-foreground))] sm:flex-row sm:items-center sm:p-6">
        <div><p className="display font-bold">Ready to apply?</p>{saveMessage && <p className="mt-1 text-xs text-[hsl(var(--secondary))]">{saveMessage}</p>}</div>
        <button onClick={saveSettings} disabled={updateMutation.isPending} className="focus-ring flex items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-5 py-3 text-xs font-extrabold text-[hsl(var(--primary-foreground))] disabled:opacity-60">{updateMutation.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}Save settings<ChevronRight size={15} /></button>
      </div>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  return <AppShell><ErrorBoundary resetKey={location}><Switch><Route path="/" component={CompetitionPage} /><Route path="/admin" component={AdminPage} /><Route component={NotFound} /></Switch></ErrorBoundary></AppShell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><SolanaWalletProviders><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></SolanaWalletProviders><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;