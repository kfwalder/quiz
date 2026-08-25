import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { jsPDF } from "jspdf";
import confetti from "canvas-confetti";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { parseQuizJson, type ImportedQuestion } from "@/lib/quiz-schema";
import { getAttemptPercentage, getAttemptsForUser, type AdminAttempt } from "@/lib/admin-attempts";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const Route = createFileRoute("/")({ component: App });

type Question = ImportedQuestion & { id: string; position: number };
type Exam = {
  id: string;
  name: string;
  created_at: string;
  owner_id: string | null;
  is_system: boolean;
  emoji: string;
  questions: Question[];
  lastAttempt?: Pick<Attempt, "completed_at" | "correct_count" | "total_questions">;
};
type Attempt = {
  id: string;
  prova_nome: string;
  completed_at: string;
  correct_count: number;
  total_questions: number;
  error_count: number;
};
type AttemptAnswer = {
  id: string;
  position: number;
  question_text: string;
  options: string[];
  correct_index: number;
  selected_index: number;
  is_correct: boolean;
  hint: string;
};
type ReviewState = {
  title: string;
  emptyMessage?: string;
  answers: AttemptAnswer[];
};
type Friend = { email: string };
type MaterialPage = {
  id: string;
  storage_path: string;
  image_name: string;
  position: number;
  rotation: number;
  corrected: boolean;
  previewUrl?: string;
};
type Material = {
  id: string;
  name: string;
  created_at: string;
  pages: MaterialPage[];
};
type Magnifier = {
  url: string;
  cursorX: number;
  cursorY: number;
  imageX: number;
  imageY: number;
  width: number;
  height: number;
  rotation: number;
};
const box = "rounded-3xl bg-card p-6 shadow-xl shadow-slate-950/10";
const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
const isLocalBrowser =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(
    window.location.hostname,
  );
// Never expose a private-network URL from the public deployment.
const localNetworkUrl = import.meta.env.DEV && isLocalBrowser
  ? import.meta.env.VITE_LOCAL_NETWORK_URL || __LOCAL_NETWORK_URL__
  : "";
const emojiOptions = ["📝", "🌍", "🏛️", "🔢", "📚", "🔬", "💻", "⚖️", "🩺", "🎨"];

function suggestExamEmoji(name: string) {
  const normalized = name.toLocaleLowerCase("pt-BR");
  if (normalized.includes("geografia")) return "🌍";
  if (normalized.includes("história") || normalized.includes("historia")) return "🏛️";
  if (normalized.includes("matemática") || normalized.includes("matematica")) return "🔢";
  if (
    normalized.includes("português") ||
    normalized.includes("portugues") ||
    normalized.includes("literatura")
  )
    return "📚";
  if (/(ciência|ciencia|biologia|química|quimica|física|fisica)/.test(normalized)) return "🔬";
  if (/(programação|programacao|informática|informatica)/.test(normalized)) return "💻";
  if (/(direito|jurídico|juridico)/.test(normalized)) return "⚖️";
  if (/(saúde|saude|medicina)/.test(normalized)) return "🩺";
  if (/(arte|música|musica)/.test(normalized)) return "🎨";
  return "📝";
}

function resultFeedback(percentage: number) {
  if (percentage >= 80) {
    return {
      emoji: "🎉 🥳 ⭐ 👏",
      message: "Parabéns! Você teve um ótimo desempenho. Continue assim!",
    };
  }
  if (percentage < 30) {
    return { emoji: "😵", message: "Não desanime. Revise o material e tente novamente com calma." };
  }
  if (percentage < 50) {
    return { emoji: "😬", message: "Você está no caminho. Revise os erros e faça mais uma tentativa." };
  }
  if (percentage < 60) {
    return { emoji: "🤔", message: "Bom começo. Use as dicas para entender melhor os pontos difíceis." };
  }
  if (percentage < 70) {
    return { emoji: "🙂", message: "Você está evoluindo. Uma revisão a mais pode elevar sua nota." };
  }
  return { emoji: "😎", message: "Quase lá! Revise os detalhes e busque superar os 80%." };
}

function App() {
  const [user, setUser] = useState<string | null>(null),
    [exams, setExams] = useState<Exam[]>([]),
    [screen, setScreen] = useState<"home" | "edit" | "quiz" | "history" | "admin" | "materials">(
      "home",
    ),
    [exam, setExam] = useState<Exam | null>(null),
    [isAdmin, setIsAdmin] = useState(false),
    [error, setError] = useState("");
  const load = async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("provas")
      .select("*, questoes(*), simulados(completed_at, correct_count, total_questions)")
      .order("created_at", { ascending: false });
    if (error) return setError(error.message);
    setExams(
      (data ?? [])
        // Admins manage other users' exams in the Admin panel, not in their personal library.
        .filter((p: any) => p.is_system || p.owner_id === user)
        .map((p: any) => ({
          ...p,
          questions: (p.questoes ?? [])
            .sort((a: any, b: any) => a.position - b.position)
            .map((q: any) => ({
              id: q.id,
              position: q.position,
              q: q.pergunta,
              a: q.alternativas,
              correct: q.resposta_correta,
              hint: q.dica,
            })),
          lastAttempt: [...(p.simulados ?? [])].sort(
            (a: Attempt, b: Attempt) =>
              new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime(),
          )[0],
        })),
    );
  };
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (user) void load();
  }, [user]);
  useEffect(() => {
    if (!user || !supabase) return;
    supabase
      .from("perfis")
      .select("role")
      .eq("id", user)
      .maybeSingle()
      .then(({ data }) => {
        setIsAdmin(data?.role === "admin");
      });
  }, [user]);
  useEffect(() => {
    if (screen === "home") setError("");
  }, [screen]);
  if (!isSupabaseConfigured)
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--gradient-bg)] p-4">
        <div className={box}>
          <b>Configure o Supabase</b>
          <p className="mt-2">
            {import.meta.env.PROD
              ? "Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY nas variaveis de build do Cloudflare e publique novamente."
              : "Copie .env.example para .env.local, preencha as credenciais e reinicie o servidor."}
          </p>
        </div>
      </main>
    );
  if (!user) return <Login setError={setError} error={error} />;
  return (
    <main className="min-h-screen bg-[var(--gradient-bg)] p-5">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3 text-foreground">
          <div>
            <h1 className="text-2xl font-extrabold">Central de Provas</h1>
            {localNetworkUrl && (
              <a
                href={localNetworkUrl}
                className="mt-1 inline-block text-sm font-medium text-primary underline underline-offset-2"
              >
                Acesso na rede: {localNetworkUrl}
              </a>
            )}
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <button
                onClick={() => setScreen("admin")}
                className="rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground"
              >
                Admin
              </button>
            )}
            <button
              onClick={() => supabase?.auth.signOut()}
              className="rounded-xl border-2 border-foreground/20 bg-card px-4 py-2 font-bold text-foreground shadow-sm transition hover:bg-muted"
            >
              Sair
            </button>
          </div>
        </header>
        {error && (
          <div
            className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-destructive p-3 text-destructive-foreground"
            role="alert"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setError("")}
              className="shrink-0 rounded-lg px-2 py-1 font-bold transition hover:bg-black/10"
              aria-label="Fechar mensagem de erro"
            >
              Fechar
            </button>
          </div>
        )}
        {screen === "home" && (
          <Home
            exams={exams}
            user={user}
            create={() => {
              setError("");
              setExam(null);
              setScreen("edit");
            }}
            edit={(e: Exam) => {
              setError("");
              setExam(e);
              setScreen("edit");
            }}
            start={(e: Exam) => {
              setExam(e);
              setScreen("quiz");
            }}
            history={(e: Exam) => {
              setExam(e);
              setScreen("history");
            }}
            materials={() => setScreen("materials")}
            remove={async (e: Exam) => {
              if (
                !confirm(
                  "Excluir esta prova? As perguntas e os simulados vinculados também serão apagados.",
                )
              )
                return;
              const { error } = await supabase!.from("provas").delete().eq("id", e.id);
              if (error) setError(error.message);
              else void load();
            }}
          />
        )}
        {screen === "edit" && (
          <Editor
            exam={exam}
            done={() => {
              void load();
              setError("");
              setScreen("home");
            }}
            cancel={() => {
              setError("");
              setScreen("home");
            }}
            setError={setError}
          />
        )}{" "}
        {screen === "quiz" && exam && (
          <Quiz
            exam={exam}
            user={user}
            done={() => {
              void load();
              setScreen("history");
            }}
            exit={() => setScreen("home")}
            setError={setError}
          />
        )}{" "}
        {screen === "history" && exam && (
          <History exam={exam} back={() => setScreen("home")} setError={setError} />
        )}
        {screen === "admin" && isAdmin && (
          <AdminPanel back={() => setScreen("home")} setError={setError} />
        )}
        {screen === "materials" && (
          <Materials user={user} back={() => setScreen("home")} setError={setError} />
        )}
      </div>
    </main>
  );
}
function Login({ setError, error }: { setError: (v: string) => void; error: string }) {
  const [signup, setSignup] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [notice, setNotice] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = signup
      ? await supabase!.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
      : await supabase!.auth.signInWithPassword({ email, password });
    if (r.error) setError(r.error.message);
    else if (signup)
      setNotice("Conta criada. Verifique seu e-mail se a confirmação estiver ativa.");
  };
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--gradient-bg)] p-4">
      <form onSubmit={submit} className={`${box} w-full max-w-md space-y-4`}>
        <h1 className="text-2xl font-bold">{signup ? "Criar conta" : "Entrar"}</h1>
        <input
          required
          type="email"
          placeholder="E-mail"
          className="w-full rounded-xl border p-3"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          required
          minLength={6}
          type="password"
          placeholder="Senha (mínimo 6 caracteres)"
          className="w-full rounded-xl border p-3"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="w-full rounded-xl bg-primary p-3 font-bold text-primary-foreground">
          {signup ? "Cadastrar" : "Entrar"}
        </button>
        <button type="button" className="w-full underline" onClick={() => setSignup(!signup)}>
          {signup ? "Já tenho conta" : "Criar conta"}
        </button>
        {notice && <p>{notice}</p>}
        {error && <p className="text-destructive">{error}</p>}
      </form>
    </main>
  );
}
const jsonGenerationPrompt = `Gere 40 perguntas sobre o conteúdo informado.

Retorne somente um JSON válido, sem Markdown, sem explicações antes ou depois do JSON. Use exatamente quatro alternativas por pergunta e informe \"correct\" com o índice da alternativa correta, de 0 a 3.

Formato esperado:
[
  {
    "q": "Pergunta 1?",
    "a": ["alternativa 1", "alternativa 2", "alternativa 3", "alternativa 4"],
    "correct": 0,
    "hint": "O correto é a alternativa 1 porque bla bla bla."
  },
  {
    "q": "Pergunta 2?",
    "a": ["alternativa 1", "alternativa 2", "alternativa 3", "alternativa 4"],
    "correct": 0,
    "hint": "O correto é a alternativa 1 porque bla bla bla."
  },
  {
    "q": "Pergunta 3?",
    "a": ["alternativa 1", "alternativa 2", "alternativa 3", "alternativa 4"],
    "correct": 0,
    "hint": "O correto é a alternativa 1 porque bla bla bla."
  }
]`;

function Home({ exams, user, create, edit, start, history, materials, remove }: any) {
  const [isPromptOpen, setIsPromptOpen] = useState(false),
    [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle"),
    [shareExam, setShareExam] = useState<Exam | null>(null),
    [openOptionsId, setOpenOptionsId] = useState<string | null>(null);
  const copyPrompt = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonGenerationPrompt);
      } else {
        const temporaryTextArea = document.createElement("textarea");
        temporaryTextArea.value = jsonGenerationPrompt;
        temporaryTextArea.style.position = "fixed";
        temporaryTextArea.style.opacity = "0";
        document.body.appendChild(temporaryTextArea);
        temporaryTextArea.select();
        const copied = document.execCommand("copy");
        temporaryTextArea.remove();
        if (!copied) throw new Error("Clipboard não disponível");
      }
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };
  return (
    <>
      <div className="mb-5 flex gap-3">
        <button
          onClick={create}
          className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"
        >
          + Nova prova
        </button>
        <button
          type="button"
          onClick={() => {
            setCopyStatus("idle");
            setIsPromptOpen(true);
          }}
          className="rounded-xl border-2 border-foreground/20 bg-card px-5 py-3 font-bold text-foreground shadow-sm transition hover:bg-muted"
        >
          Prompt geração JSON
        </button>
        <button
          type="button"
          onClick={materials}
          className="rounded-xl border-2 border-foreground/20 bg-card px-5 py-3 font-bold text-foreground shadow-sm transition hover:bg-muted"
        >
          📄 Gerar PDF de material
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {exams.map((e: Exam) => (
          <article className={box} key={e.id}>
            <h2 className="font-bold">
              <span className="mr-2" aria-hidden="true">
                {e.emoji || suggestExamEmoji(e.name)}
              </span>
              {e.name} {e.is_system && <small className="text-success">GLOBAL</small>}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {e.questions.length} questões · {date(e.created_at)}
            </p>
            <p className="mt-2 text-sm font-semibold text-primary">
              {e.lastAttempt
                ? `Último simulado: ${Math.round((e.lastAttempt.correct_count / e.lastAttempt.total_questions) * 100)}% de acertos`
                : "Nenhum simulado realizado"}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                disabled={!e.questions.length}
                onClick={() => start(e)}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
              >
                ▶️ Iniciar
              </button>
              <button
                type="button"
                aria-expanded={openOptionsId === e.id}
                aria-controls={`exam-options-${e.id}`}
                onClick={() => setOpenOptionsId((currentId) => (currentId === e.id ? null : e.id))}
                className="rounded-xl border px-4 py-2 text-sm font-bold transition hover:bg-muted"
              >
                Mais opções
              </button>
            </div>
            <div
              id={`exam-options-${e.id}`}
              className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                openOptionsId === e.id
                  ? "mt-3 grid-rows-[1fr] opacity-100"
                  : "mt-0 grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => history(e)}
                    className="w-full rounded-xl border px-4 py-2 text-left text-sm font-bold transition hover:bg-muted"
                  >
                    🕘 Histórico
                  </button>
                  {!e.is_system && (
                    <button
                      onClick={() => setShareExam(e)}
                      className="w-full rounded-xl border px-4 py-2 text-left text-sm font-bold transition hover:bg-muted"
                    >
                      📤 Enviar prova pra amigo
                    </button>
                  )}
                  {e.owner_id === user && (
                    <>
                      <button
                        onClick={() => edit(e)}
                        className="w-full rounded-xl border px-4 py-2 text-left text-sm font-bold transition hover:bg-muted"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => remove(e)}
                        className="w-full rounded-xl border border-destructive px-4 py-2 text-left text-sm font-bold text-destructive transition hover:bg-destructive/10"
                      >
                        🗑️ Excluir
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      {isPromptOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={() => setIsPromptOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="generation-prompt-title"
            className="w-full max-w-3xl rounded-3xl bg-card p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="generation-prompt-title" className="text-xl font-bold">
              Prompt geração JSON
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Copie o texto, informe o conteúdo desejado ao notebook LLM e depois cole o JSON gerado em uma
              nova prova. Antes disso, o notebook LLM deve ser alimentado com o PDF contendo o material de estudos.
            </p>
            <textarea
              readOnly
              value={jsonGenerationPrompt}
              className="mt-4 h-96 w-full resize-y rounded-xl border p-3 font-mono text-sm leading-relaxed"
              onFocus={(event) => event.currentTarget.select()}
            />
            {copyStatus === "failed" && (
              <p className="mt-3 text-sm text-destructive">
                Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => void copyPrompt()}
                className="rounded-xl border px-5 py-3 font-bold transition hover:bg-muted"
              >
                {copyStatus === "copied" ? "Copiado!" : "Copiar prompt"}
              </button>
              <button
                onClick={() => setIsPromptOpen(false)}
                className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"
              >
                Fechar
              </button>
            </div>
          </section>
        </div>
      )}
      {shareExam && <SendExamModal exam={shareExam} onClose={() => setShareExam(null)} />}
    </>
  );
}
function SendExamModal({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const [email, setEmail] = useState(""),
    [friends, setFriends] = useState<Friend[]>([]),
    [status, setStatus] = useState(""),
    [sending, setSending] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("amigos")
      .select("email")
      .order("last_shared_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setStatus(error.message);
        else setFriends(data ?? []);
      });
  }, []);
  const send = async () => {
    if (!email.trim()) return setStatus("Informe o e-mail do amigo.");
    setSending(true);
    setStatus("");
    const { error } = await supabase!.rpc("copy_exam_to_user", {
      source_exam_id: exam.id,
      recipient_email_input: email.trim(),
    });
    setSending(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    setFriends((currentFriends) => [
      { email: normalizedEmail },
      ...currentFriends.filter((friend) => friend.email !== normalizedEmail),
    ]);
    setStatus(`Prova enviada para ${normalizedEmail}.`);
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-exam-title"
        className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="send-exam-title" className="text-xl font-bold">
          Enviar prova pra amigo
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Envie uma cópia de{" "}
          <b>
            {exam.emoji || suggestExamEmoji(exam.name)} {exam.name}
          </b>
          . O amigo precisa já ter uma conta cadastrada.
        </p>
        {friends.length > 0 && (
          <label className="mt-5 block text-sm font-semibold">
            Escolha um amigo salvo
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) setEmail(event.target.value);
              }}
              className="mt-1 w-full rounded-xl border bg-card p-3"
            >
              <option value="">Selecione um amigo</option>
              {friends.map((friend) => (
                <option key={friend.email} value={friend.email}>
                  {friend.email}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="mt-5 block text-sm font-semibold">
          E-mail do amigo
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="amigo@email.com"
            className="mt-1 w-full rounded-xl border p-3"
          />
        </label>
        {status && (
          <p
            role="alert"
            className={`mt-3 rounded-xl p-3 text-sm ${status.startsWith("Prova enviada") ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}
          >
            {status}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border px-5 py-3">
            Fechar
          </button>
          <button
            disabled={sending}
            onClick={() => void send()}
            className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-60"
          >
            {sending ? "Enviando..." : "Enviar prova"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Editor({ exam, done, cancel, setError, editSystemExam = false }: any) {
  const [name, setName] = useState(exam?.name ?? ""),
    [emoji, setEmoji] = useState(exam?.emoji ?? suggestExamEmoji(exam?.name ?? "")),
    [isEmojiManual, setIsEmojiManual] = useState(Boolean(exam?.emoji)),
    [questions, setQuestions] = useState<ImportedQuestion[] | null>(
      exam?.questions?.map(({ q, a, correct, hint }: Question) => ({ q, a, correct, hint })) ??
        null,
    ),
    [isDragging, setIsDragging] = useState(false),
    [isPasteOpen, setIsPasteOpen] = useState(false),
    [pastedJson, setPastedJson] = useState(""),
    [pasteError, setPasteError] = useState("");
  const loadJson = (content: string, onInvalid = setError) => {
    try {
      setQuestions(parseQuizJson(content));
      return true;
    } catch (e) {
      onInvalid(e instanceof Error ? e.message : "JSON inválido");
      return false;
    }
  };
  const file = async (f?: File) => {
    if (!f?.name.endsWith(".json")) return setError("Escolha um arquivo .json.");
    loadJson(await f.text());
  };
  const save = async () => {
    if (!name.trim() || !questions) return setError("Informe o nome e um arquivo JSON válido.");
    const { error } = await supabase!.rpc(editSystemExam ? "admin_save_system_exam" : "save_exam", {
      exam_name: name,
      payload: questions,
      existing_id: exam?.id ?? null,
      exam_emoji: emoji,
    });
    if (error) setError(error.message);
    else done();
  };
  return (
    <section className={`${box} max-w-2xl`}>
      <h2 className="text-xl font-bold">{exam ? "Editar prova" : "Nova prova"}</h2>
      <input
        value={name}
        maxLength={120}
        placeholder="Nome da prova"
        className="mt-4 w-full rounded-xl border p-3"
        onChange={(e) => {
          setName(e.target.value);
          if (!isEmojiManual) setEmoji(suggestExamEmoji(e.target.value));
        }}
      />
      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">Emoji da prova</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {emojiOptions.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`Usar emoji ${option}`}
              onClick={() => {
                setEmoji(option);
                setIsEmojiManual(true);
              }}
              className={`rounded-xl border-2 px-3 py-2 text-xl transition ${emoji === option ? "border-primary bg-primary/10" : "border-transparent bg-muted hover:border-border"}`}
            >
              {option}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setIsEmojiManual(false);
              setEmoji(suggestExamEmoji(name));
            }}
            className="rounded-xl border px-3 py-2 text-sm font-semibold"
          >
            Automático
          </button>
        </div>
      </fieldset>
      <label
        className={`mt-4 block cursor-pointer rounded-xl border-2 border-dashed p-5 transition ${
          isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"
        }`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void file(event.dataTransfer.files[0]);
        }}
      >
        <span className="font-semibold">Arraste um arquivo .json do Finder para cá</span>
        <span className="mt-1 block text-sm text-muted-foreground">ou clique para selecionar</span>
        <input
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => void file(e.target.files?.[0])}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          setPasteError("");
          setIsPasteOpen(true);
        }}
        className="mt-3 rounded-xl border px-4 py-2 text-sm font-bold transition hover:bg-muted"
      >
        Colar JSON
      </button>
      {questions && (
        <p className="mt-3 text-success">Arquivo válido: {questions.length} questões.</p>
      )}
      <div className="mt-5 flex gap-2">
        <button
          onClick={save}
          className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"
        >
          Salvar
        </button>
        <button onClick={cancel} className="rounded-xl border px-5">
          Cancelar
        </button>
      </div>
      {isPasteOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={() => setIsPasteOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="paste-json-title"
            className="w-full max-w-2xl rounded-3xl bg-card p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h3 id="paste-json-title" className="text-xl font-bold">
              Colar JSON
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Cole a lista de questões no formato JSON.
            </p>
            <textarea
              autoFocus
              value={pastedJson}
              onChange={(event) => {
                setPastedJson(event.target.value);
                setPasteError("");
              }}
              placeholder={
                '[\n  { "q": "Pergunta", "a": ["A", "B", "C", "D"], "correct": 0, "hint": "Dica" }\n]'
              }
              className="mt-4 h-64 w-full resize-y rounded-xl border p-3 font-mono text-sm"
            />
            {pasteError && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive"
              >
                Corrija o JSON: {pasteError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setIsPasteOpen(false)} className="rounded-xl border px-5 py-3">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (loadJson(pastedJson, setPasteError)) setIsPasteOpen(false);
                }}
                className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"
              >
                Confirmar JSON
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
function Quiz({ exam, user, done, exit, setError }: any) {
  const [qs] = useState(() => [...exam.questions].sort(() => Math.random() - 0.5)),
    [i, setI] = useState(0),
    [answers, setAnswers] = useState<any[]>([]),
    [pick, setPick] = useState<number | null>(null),
    [optionsVisible, setOptionsVisible] = useState(true),
    [optionsLocked, setOptionsLocked] = useState(false),
    [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [result, setResult] = useState<{ correct: number; total: number } | null>(null);
  const savingRef = useRef(false);
  const q = qs[i];
  useEffect(() => {
    if (!result || (result.correct / result.total) * 100 < 80) return;

    const celebrationEndsAt = Date.now() + 5_000;
    const timer = window.setInterval(() => {
      if (Date.now() >= celebrationEndsAt) {
        window.clearInterval(timer);
        return;
      }
      confetti({
        particleCount: 28,
        spread: 70,
        startVelocity: 28,
        origin: { x: Math.random(), y: 0.15 },
      });
    }, 280);
    return () => window.clearInterval(timer);
  }, [result]);
  const celebrateCorrectAnswer = () => {
    const options = { particleCount: 55, spread: 65, startVelocity: 35, origin: { y: 0.72 } };
    confetti({ ...options, angle: 60, origin: { x: 0, y: 0.72 } });
    confetti({ ...options, angle: 120, origin: { x: 1, y: 0.72 } });
  };
  const select = (n: number) => {
    if (pick !== null || saving) return;
    setPick(n);
    if (n === q.correct) celebrateCorrectAnswer();
  };
  const next = async () => {
    if (pick === null || savingRef.current) return;
    const rows = [...answers, { q, selected: pick }];
    if (i < qs.length - 1) {
      setAnswers(rows);
      setI(i + 1);
      setPick(null);
      setOptionsVisible(!optionsLocked);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const correct = rows.filter((x) => x.selected === x.q.correct).length;
    const { data: a, error } = await supabase!
      .from("simulados")
      .insert({
        user_id: user,
        prova_id: exam.id,
        prova_nome: exam.name,
        total_questions: qs.length,
        correct_count: correct,
        error_count: qs.length - correct,
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      savingRef.current = false;
      setSaving(false);
      return setError(error.message);
    }
    const { error: ae } = await supabase!.from("respostas_simulado").insert(
      rows.map((x, n) => ({
        simulado_id: a.id,
        position: n,
        question_text: x.q.q,
        options: x.q.a,
        correct_index: x.q.correct,
        selected_index: x.selected,
        is_correct: x.selected === x.q.correct,
        hint: x.q.hint,
      })),
    );
    if (ae) {
      savingRef.current = false;
      setSaving(false);
      return setError(ae.message);
    }
    setResult({ correct, total: qs.length });
  };
  if (result) {
    const percentage = Math.round((result.correct / result.total) * 100);
    const errors = result.total - result.correct;
    const feedback = resultFeedback(percentage);
    return (
      <section className={`${box} max-w-2xl text-center`}>
        <p className="text-sm font-semibold text-primary">Simulado concluído</p>
        <h2 className="mt-2 text-2xl font-extrabold">
          {exam.emoji || suggestExamEmoji(exam.name)} {exam.name}
        </h2>
        <p className="mt-6 text-5xl font-extrabold text-primary">{percentage}%</p>
        <p className="mt-1 text-sm text-muted-foreground">de acertos</p>
        <p className="mt-5 text-3xl" aria-hidden="true">
          {feedback.emoji}
        </p>
        <p className="mt-2 font-semibold text-foreground" aria-live="polite">
          {feedback.message}
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 text-left">
          <div className="rounded-2xl bg-success/15 p-4">
            <p className="text-sm font-semibold text-success">Acertos</p>
            <p className="mt-1 text-2xl font-extrabold">
              {result.correct}/{result.total}
            </p>
          </div>
          <div className="rounded-2xl bg-destructive/10 p-4">
            <p className="text-sm font-semibold text-destructive">Erros</p>
            <p className="mt-1 text-2xl font-extrabold">{errors}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={done}
            className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"
          >
            🕘 Ver histórico
          </button>
          <button
            onClick={exit}
            className="rounded-xl border px-5 py-3 font-bold transition hover:bg-muted"
          >
            Voltar às provas
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className={`${box} max-w-2xl`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {exam.name} · questão {i + 1}/{qs.length}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            aria-label={optionsVisible ? "Ocultar alternativas" : "Mostrar alternativas"}
            aria-pressed={optionsVisible}
            onClick={() => setOptionsVisible((visible) => !visible)}
            className="rounded-lg border px-3 py-2 text-lg transition hover:bg-muted"
            title={optionsVisible ? "Ocultar alternativas" : "Mostrar alternativas"}
          >
            {optionsVisible ? "👁️" : "🙈"}
          </button>
          <button
            type="button"
            aria-label={optionsLocked ? "Desbloquear alternativas nas próximas questões" : "Ocultar alternativas nas próximas questões"}
            aria-pressed={optionsLocked}
            onClick={() => setOptionsLocked((locked) => !locked)}
            className="rounded-lg border px-3 py-2 text-lg transition hover:bg-muted"
            title={optionsLocked ? "Desbloquear alternativas nas próximas questões" : "Ocultar alternativas nas próximas questões"}
          >
            {optionsLocked ? "🔒" : "🔓"}
          </button>
        </div>
      </div>
      <h2 className="mt-4 text-xl font-bold">{q.q}</h2>
      <div className="mt-5 space-y-2">
        {q.a.map((a: string, n: number) => {
          const donePick = pick !== null;
          const good = n === q.correct;
          return (
            <button
              disabled={donePick || saving}
              onClick={() => select(n)}
              className={`w-full rounded-xl border-2 p-4 text-left ${donePick && good ? "border-success bg-success/15" : donePick && n === pick ? "border-destructive bg-destructive/10" : ""}`}
            >
              {optionsVisible ? a : `Alternativa ${n + 1}`}
            </button>
          );
        })}
      </div>
      {pick !== null && (
        <div className="mt-4">
          <p>{pick === q.correct ? "Acertou!" : q.hint}</p>
          <button
            disabled={saving}
            onClick={next}
            className="mt-4 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Salvando..." : i === qs.length - 1 ? "Ver resultado" : "Próxima"}
          </button>
        </div>
      )}
      <Dialog open={isExitConfirmOpen} onOpenChange={setIsExitConfirmOpen}>
        <DialogTrigger asChild>
          <button
            disabled={saving}
            className="mt-8 rounded-xl border border-destructive px-5 py-3 text-sm font-bold text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
          >
            Sair sem salvar
          </button>
        </DialogTrigger>
        <DialogContent className="rounded-3xl bg-card p-6 shadow-2xl sm:rounded-3xl">
          <DialogHeader>
            <DialogTitle>Deseja sair da prova?</DialogTitle>
            <DialogDescription>
              Suas respostas desta tentativa serão perdidas e não poderão ser recuperadas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className="rounded-md border px-4 py-2 font-medium transition hover:bg-muted">Não</button>
            </DialogClose>
            <button
              onClick={exit}
              className="rounded-md bg-destructive px-4 py-2 font-medium text-destructive-foreground transition hover:bg-destructive/90"
            >
              Sim
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function History({
  exam,
  back,
  setError,
}: {
  exam: Exam;
  back: () => void;
  setError: (message: string) => void;
}) {
  const [attempts, setAttempts] = useState<Attempt[]>([]),
    [review, setReview] = useState<ReviewState | null>(null),
    [deletingId, setDeletingId] = useState<string | null>(null);
  useEffect(() => {
    supabase!
      .from("simulados")
      .select("*")
      .eq("prova_id", exam.id)
      .order("completed_at", { ascending: false })
      .then(({ data, error }) => (error ? setError(error.message) : setAttempts(data ?? [])));
  }, [exam.id, setError]);
  const loadReview = async (attemptId: string, onlyErrors: boolean) => {
    let query = supabase!
      .from("respostas_simulado")
      .select("*")
      .eq("simulado_id", attemptId)
      .order("position");
    if (onlyErrors) query = query.eq("is_correct", false);
    const { data, error } = await query;
    if (error) setError(error.message);
    else
      setReview({
        title: onlyErrors ? "Revisão dos erros" : "Revisão",
        emptyMessage: onlyErrors ? "Nenhum erro neste simulado." : undefined,
        answers: (data ?? []) as AttemptAnswer[],
      });
  };
  const deleteAttempt = async (attempt: Attempt) => {
    if (!confirm(`Apagar o simulado de ${attempt.prova_nome}? Esta ação não pode ser desfeita.`))
      return;
    setDeletingId(attempt.id);
    const { error } = await supabase!.from("simulados").delete().eq("id", attempt.id);
    setDeletingId(null);
    if (error) setError(error.message);
    else setAttempts((current) => current.filter((item) => item.id !== attempt.id));
  };
  if (review)
    return (
      <section className={box}>
        <button onClick={() => setReview(null)} className="underline">
          Voltar
        </button>
        <h2 className="mt-4 text-xl font-bold">{review.title}</h2>
        {review.answers.length === 0 ? (
          <p className="mt-4 text-muted-foreground">{review.emptyMessage ?? "Nenhuma resposta encontrada."}</p>
        ) : (
          review.answers.map((a) => (
            <article key={a.id} className="mt-4 rounded-xl border p-4">
              <b>{a.question_text}</b>
              <p className={a.is_correct ? "text-success" : "text-destructive"}>
                Sua resposta: {a.options[a.selected_index]}
              </p>
              {!a.is_correct && (
                <p>
                  Correta: {a.options[a.correct_index]} · {a.hint}
                </p>
              )}
            </article>
          ))
        )}
      </section>
    );
  return (
    <section className={box}>
      <button onClick={back} className="underline">
        Voltar às provas
      </button>
      <h2 className="mt-4 text-xl font-bold">Simulados de {exam.name}</h2>
      <div className="mt-4 space-y-3">
        {attempts.map((a, index) => (
          <article key={a.id} className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <b>{a.prova_nome}</b>
              <button
                type="button"
                aria-label={`Apagar simulado de ${a.prova_nome}`}
                title="Apagar simulado"
                disabled={deletingId === a.id}
                onClick={() => void deleteAttempt(a)}
                className="rounded-lg p-2 text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
            <p>
              {date(a.completed_at)} · {a.correct_count}/{a.total_questions} acertos ·{" "}
              {a.error_count} erros
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              <button className="underline" onClick={() => void loadReview(a.id, false)}>
                Revisar respostas
              </button>
              {index === 0 && (
                <button className="underline" onClick={() => void loadReview(a.id, true)}>
                  Revisar erros
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminPanel({ back, setError }: { back: () => void; setError: (message: string) => void }) {
  const [users, setUsers] = useState<any[]>([]),
    [allExams, setAllExams] = useState<any[]>([]),
    [allAttempts, setAllAttempts] = useState<AdminAttempt[]>([]),
    [expandedUserExamId, setExpandedUserExamId] = useState<string | null>(null),
    [expandedUserAttemptId, setExpandedUserAttemptId] = useState<string | null>(null),
    [showSystemExams, setShowSystemExams] = useState(false),
    [editingSystemExam, setEditingSystemExam] = useState<any | null>(null);
  const statsByExam = new Map<string, { count: number; last?: any }>();
  for (const attempt of allAttempts) {
    if (!attempt.prova_id) continue;
    const current = statsByExam.get(attempt.prova_id) ?? { count: 0 };
    current.count += 1;
    if (!current.last || new Date(attempt.completed_at) > new Date(current.last.completed_at))
      current.last = attempt;
    statsByExam.set(attempt.prova_id, current);
  }
  const loadAdminData = async () => {
    const [profiles, exams, attempts] = await Promise.all([
      supabase!.from("perfis").select("id, email, role").order("created_at", { ascending: false }),
      supabase!
        .from("provas")
        .select("id, name, emoji, owner_id, is_system, created_at, questoes(*)")
        .order("created_at", { ascending: false }),
      supabase!
        .from("simulados")
        .select("user_id, prova_id, completed_at, correct_count, total_questions, error_count, provas(name)"),
    ]);
    const error = profiles.error || exams.error || attempts.error;
    if (error) setError(error.message);
    else {
      setUsers(profiles.data ?? []);
      setAllExams(exams.data ?? []);
      setAllAttempts(
        (attempts.data ?? []).map((attempt: any) => ({
          user_id: attempt.user_id,
          prova_id: attempt.prova_id,
          prova_nome: attempt.provas?.name ?? "Prova sem nome",
          completed_at: attempt.completed_at,
          correct_count: attempt.correct_count,
          total_questions: attempt.total_questions,
          error_count: attempt.error_count,
        })),
      );
    }
  };
  useEffect(() => {
    void loadAdminData();
  }, []);
  const publish = async (exam: any) => {
    if (!confirm(`Tornar "${exam.name}" uma prova global? Ela ficará disponível para todos.`))
      return;
    const { error } = await supabase!
      .from("provas")
      .update({ is_system: true, owner_id: null })
      .eq("id", exam.id);
    if (error) setError(error.message);
    else void loadAdminData();
  };
  const remove = async (exam: any) => {
    if (!confirm(`Excluir "${exam.name}" e todos os seus simulados?`)) return;
    const { error } = await supabase!.from("provas").delete().eq("id", exam.id);
    if (error) setError(error.message);
    else void loadAdminData();
  };
  const renderExam = (exam: any) => {
    const stats = statsByExam.get(exam.id);
    const lastScore = stats?.last
      ? Math.round((stats.last.correct_count / stats.last.total_questions) * 100)
      : null;
    return (
      <div
        key={exam.id}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3"
      >
        <span>
          <b>
            {exam.emoji} {exam.name}
          </b>
          <span className="mt-1 block text-sm text-muted-foreground">
            {stats?.count ?? 0} simulados · {lastScore === null ? "sem nota" : `última nota: ${lastScore}%`}
          </span>
        </span>
        <span className="flex gap-2">
          {exam.is_system && (
            <button
              onClick={() => setEditingSystemExam(exam)}
              className="rounded-lg border px-3 py-1 text-sm"
            >
              Editar
            </button>
          )}
          {!exam.is_system && (
            <button
              onClick={() => void publish(exam)}
              className="rounded-lg border px-3 py-1 text-sm"
            >
              Tornar global
            </button>
          )}
          <button
            onClick={() => void remove(exam)}
            className="rounded-lg border border-destructive px-3 py-1 text-sm text-destructive"
          >
            Excluir
          </button>
        </span>
      </div>
    );
  };
  const systemExams = allExams.filter((exam) => exam.is_system);
  if (editingSystemExam) {
    return (
      <Editor
        exam={{
          ...editingSystemExam,
          questions: (editingSystemExam.questoes ?? [])
            .sort((first: any, second: any) => first.position - second.position)
            .map((question: any) => ({
              id: question.id,
              position: question.position,
              q: question.pergunta,
              a: question.alternativas,
              correct: question.resposta_correta,
              hint: question.dica,
            })),
        }}
        editSystemExam
        setError={setError}
        done={() => {
          setEditingSystemExam(null);
          void loadAdminData();
        }}
        cancel={() => setEditingSystemExam(null)}
      />
    );
  }
  return (
    <section className={box}>
      <button onClick={back} className="underline">
        Voltar às provas
      </button>
      <h2 className="mt-4 text-2xl font-bold">Painel administrativo</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-muted p-4">
          <b className="text-2xl">{users.length}</b>
          <p>usuários</p>
        </div>
        <div className="rounded-2xl bg-muted p-4">
          <b className="text-2xl">{allExams.length}</b>
          <p>provas</p>
        </div>
        <div className="rounded-2xl bg-muted p-4">
          <b className="text-2xl">{allAttempts.length}</b>
          <p>simulados</p>
        </div>
      </div>
      <h3 className="mt-8 text-lg font-bold">Usuários</h3>
      <div className="mt-2 space-y-2">
        {users.map((profile) => {
          const userExams = allExams.filter((exam) => exam.owner_id === profile.id);
          const userAttempts = getAttemptsForUser(allAttempts, profile.id);
          const isExamExpanded = expandedUserExamId === profile.id;
          const isAttemptExpanded = expandedUserAttemptId === profile.id;
          return (
            <article key={profile.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <b>{profile.email}</b>
                  <span className="ml-2 text-sm text-muted-foreground">{profile.role}</span>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {userExams.length} prova(s) · {userAttempts.length} simulado(s) realizado(s)
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-expanded={isExamExpanded}
                    onClick={() =>
                      setExpandedUserExamId((current) => (current === profile.id ? null : profile.id))
                    }
                    className="rounded-lg border px-3 py-2 text-sm font-bold transition hover:bg-muted"
                  >
                    {isExamExpanded ? "Ocultar provas" : `Ver provas (${userExams.length})`}
                  </button>
                  <button
                    type="button"
                    aria-expanded={isAttemptExpanded}
                    onClick={() =>
                      setExpandedUserAttemptId((current) => (current === profile.id ? null : profile.id))
                    }
                    className="rounded-lg border px-3 py-2 text-sm font-bold transition hover:bg-muted"
                  >
                    {isAttemptExpanded ? "Ocultar simulados" : `Ver simulados (${userAttempts.length})`}
                  </button>
                </div>
              </div>
              {isExamExpanded && (
                <div className="mt-4 space-y-2 border-t pt-4">
                  {userExams.length ? (
                    userExams.map(renderExam)
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma prova criada.</p>
                  )}
                </div>
              )}
              {isAttemptExpanded && (
                <div className="mt-4 space-y-2 border-t pt-4">
                  {userAttempts.length ? (
                    userAttempts.map((attempt) => (
                      <article key={`${profile.id}-${attempt.completed_at}-${attempt.prova_nome}`} className="rounded-xl border bg-card p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <b>{attempt.prova_nome}</b>
                          <span className="text-sm text-muted-foreground">{date(attempt.completed_at)}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {attempt.correct_count}/{attempt.total_questions} acertos ·{" "}
                          {getAttemptPercentage(attempt)}% · {attempt.error_count} erros
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum simulado realizado.</p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {systemExams.length > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold">Provas globais</h3>
            <button
              type="button"
              aria-expanded={showSystemExams}
              onClick={() => setShowSystemExams((current) => !current)}
              className="rounded-lg border px-3 py-2 text-sm font-bold transition hover:bg-muted"
            >
              {showSystemExams ? "Ocultar provas" : `Ver provas (${systemExams.length})`}
            </button>
          </div>
          {showSystemExams && <div className="mt-3 space-y-2">{systemExams.map(renderExam)}</div>}
        </section>
      )}
    </section>
  );
}

async function materialImageAsJpeg(url: string, rotation: number) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível baixar uma das imagens.");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Uma imagem não pôde ser processada."));
      element.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    const isSideways = rotation === 90 || rotation === 270;
    canvas.width = isSideways ? image.naturalHeight : image.naturalWidth;
    canvas.height = isSideways ? image.naturalWidth : image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar uma imagem para o PDF.");
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    return {
      dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function Materials({
  user,
  back,
  setError,
}: {
  user: string;
  back: () => void;
  setError: (message: string) => void;
}) {
  const [materials, setMaterials] = useState<Material[]>([]),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [name, setName] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [isFileDragging, setIsFileDragging] = useState(false),
    [creating, setCreating] = useState(false),
    [saving, setSaving] = useState(false),
    [uploadedCount, setUploadedCount] = useState(0),
    [loadingMaterials, setLoadingMaterials] = useState(true),
    [generatingId, setGeneratingId] = useState<string | null>(null),
    [generatingProgress, setGeneratingProgress] = useState<{ current: number; total: number } | null>(
      null,
    ),
    [deletingId, setDeletingId] = useState<string | null>(null),
    [draggedPageId, setDraggedPageId] = useState<string | null>(null),
    [dropTargetId, setDropTargetId] = useState<string | null>(null),
    [pageNumbers, setPageNumbers] = useState<Record<string, string>>({}),
    [zoomedPageId, setZoomedPageId] = useState<string | null>(null),
    [hideCorrected, setHideCorrected] = useState(false),
    [magnifier, setMagnifier] = useState<Magnifier | null>(null),
    [zoomBounds, setZoomBounds] = useState({ width: 0, height: 0 }),
    [zoomImageSize, setZoomImageSize] = useState<{ width: number; height: number } | null>(null),
    [status, setStatus] = useState("");
  const zoomContainerRef = useRef<HTMLDivElement | null>(null);
  const selected = materials.find((material) => material.id === selectedId) ?? null;
  const visiblePages = selected?.pages.filter((page) => !hideCorrected || !page.corrected) ?? [];
  const zoomedPage = selected?.pages.find((page) => page.id === zoomedPageId) ?? null;
  const visibleZoomedPageIndex = visiblePages.findIndex((page) => page.id === zoomedPageId);
  const selectImages = (incomingFiles: FileList | File[]) => {
    const selectedFiles = Array.from(incomingFiles);
    const images = selectedFiles.filter((file) => file.type.startsWith("image/"));
    if (images.length !== selectedFiles.length) {
      setStatus("Somente arquivos de imagem podem ser adicionados ao material.");
    }
    setFiles(
      images.sort((first, second) =>
        first.name.localeCompare(second.name, "pt-BR", { numeric: true, sensitivity: "base" }),
      ),
    );
  };

  const loadMaterials = async () => {
    setLoadingMaterials(true);
    try {
      const { data, error } = await supabase!
        .from("materiais")
        .select("*, material_paginas(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const prepared = await Promise.all(
        (data ?? []).map(async (material: any) => {
          const pages = await Promise.all(
            (material.material_paginas ?? []).map(async (page: any) => {
              const { data: signed, error: signedError } = await supabase!.storage
                .from("materiais")
                .createSignedUrl(page.storage_path, 60 * 60);
              if (signedError) throw signedError;
              return {
                ...page,
                rotation: page.rotation ?? 0,
                corrected: page.corrected ?? false,
                previewUrl: signed.signedUrl,
              };
            }),
          );
          return { ...material, pages: pages.sort((a, b) => a.position - b.position) } as Material;
        }),
      );
      setMaterials(prepared);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível abrir os materiais.");
    } finally {
      setLoadingMaterials(false);
    }
  };
  useEffect(() => {
    void loadMaterials();
  }, []);
  useEffect(() => {
    if (!selected || !zoomedPageId || visibleZoomedPageIndex === -1) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setZoomedPageId(null);
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const nextIndex =
        (visibleZoomedPageIndex + direction + visiblePages.length) % visiblePages.length;
      setZoomedPageId(visiblePages[nextIndex].id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, zoomedPageId, hideCorrected, visibleZoomedPageIndex, visiblePages]);
  useEffect(() => {
    if (!zoomedPage) return;
    setZoomImageSize(null);
    const container = zoomContainerRef.current;
    if (!container) return;
    const updateBounds = () => {
      const { width, height } = container.getBoundingClientRect();
      setZoomBounds({ width: Math.max(width - 16, 0), height: Math.max(height - 16, 0) });
    };
    updateBounds();
    const observer = new ResizeObserver(updateBounds);
    observer.observe(container);
    return () => observer.disconnect();
  }, [zoomedPageId, zoomedPage?.previewUrl]);

  const saveMaterial = async () => {
    if (!name.trim() || files.length === 0) {
      setStatus("Informe o nome e selecione ao menos uma imagem.");
      return;
    }
    setSaving(true);
    setUploadedCount(0);
    setStatus("");
    const { data: material, error } = await supabase!
      .from("materiais")
      .insert({ owner_id: user, name: name.trim() })
      .select()
      .single();
    if (error) {
      setSaving(false);
      setStatus(error.message);
      return;
    }
    const pages: Omit<MaterialPage, "id" | "previewUrl">[] = [];
    try {
      for (const [index, file] of files.entries()) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const storagePath = `${user}/${material.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase!.storage
          .from("materiais")
          .upload(storagePath, file);
        if (uploadError) throw uploadError;
        pages.push({
          storage_path: storagePath,
          image_name: file.name,
          position: index + 1,
          rotation: 0,
          corrected: false,
        });
        setUploadedCount(index + 1);
      }
      const { error: pagesError } = await supabase!
        .from("material_paginas")
        .insert(pages.map((page) => ({ ...page, material_id: material.id })));
      if (pagesError) throw pagesError;
      await loadMaterials();
      setSelectedId(material.id);
      setName("");
      setFiles([]);
      setCreating(false);
    } catch (uploadError) {
      setStatus(
        uploadError instanceof Error ? uploadError.message : "Não foi possível salvar as imagens.",
      );
    } finally {
      setSaving(false);
      setUploadedCount(0);
    }
  };

  const updatePagePosition = (
    material: Material,
    pageId: string,
    position: number,
    markCorrected = false,
  ) => {
    const pages = material.pages
      .map((page) =>
        page.id === pageId
          ? { ...page, position, corrected: markCorrected || page.corrected }
          : page,
      )
      .sort((first, second) => first.position - second.position);
    setMaterials((current) =>
      current.map((item) => (item.id === material.id ? { ...item, pages } : item)),
    );
    setPageNumbers({});
    if (markCorrected && hideCorrected && zoomedPageId === pageId) {
      setZoomedPageId(pages.find((page) => !page.corrected)?.id ?? null);
    }
    const updatePosition = supabase!.rpc("reorder_material_pages", {
      page_id_input: pageId,
      page_position_input: position,
    });
    const updateCorrection = markCorrected
      ? supabase!.from("material_paginas").update({ corrected: true }).eq("id", pageId)
      : Promise.resolve({ error: null });
    void Promise.all([updatePosition, updateCorrection]).then(
      ([positionResult, correctionResult]) => {
        const error = positionResult.error ?? correctionResult.error;
        if (error) {
          setStatus(error.message);
          void loadMaterials();
        }
      },
    );
  };

  const movePage = (material: Material, sourceId: string, targetIndex: number) => {
    const sourceIndex = material.pages.findIndex((page) => page.id === sourceId);
    if (sourceIndex < 0 || sourceIndex === targetIndex) return;
    updatePagePosition(material, sourceId, targetIndex + 1);
  };

  const commitPageNumber = (material: Material, page: MaterialPage, value: string) => {
    const target = Number(value);
    if (Number.isInteger(target) && target >= 1) {
      updatePagePosition(material, page.id, target, true);
    } else {
      setPageNumbers((current) => ({ ...current, [page.id]: String(page.position) }));
    }
  };

  const generatePdf = async (material: Material) => {
    if (!material.pages.length) return;
    setGeneratingId(material.id);
    setGeneratingProgress({ current: 0, total: material.pages.length });
    setStatus("");
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (const [index, page] of material.pages.entries()) {
        if (!page.previewUrl)
          throw new Error("A prévia de uma imagem expirou. Atualize a página e tente novamente.");
        if (index > 0) pdf.addPage();
        const image = await materialImageAsJpeg(page.previewUrl, page.rotation);
        const maxWidth = 190;
        const maxHeight = 277;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        pdf.addImage(image.dataUrl, "JPEG", (210 - width) / 2, (297 - height) / 2, width, height);
        setGeneratingProgress({ current: index + 1, total: material.pages.length });
      }
      const filename = material.name.replace(/[^a-zA-Z0-9_-]/g, "-") || "material";
      pdf.save(`${filename}.pdf`);
      setStatus("PDF gerado com sucesso.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setGeneratingId(null);
      setGeneratingProgress(null);
    }
  };

  const deleteMaterial = async (material: Material) => {
    if (!confirm(`Apagar o material "${material.name}" e todas as suas imagens?`)) return;
    setDeletingId(material.id);
    setStatus("");
    const paths = material.pages.map((page) => page.storage_path);
    if (paths.length) {
      const { error: storageError } = await supabase!.storage.from("materiais").remove(paths);
      if (storageError) {
        setStatus(storageError.message);
        setDeletingId(null);
        return;
      }
    }
    const { error } = await supabase!.from("materiais").delete().eq("id", material.id);
    if (error) {
      setStatus(error.message);
    } else {
      setMaterials((current) => current.filter((item) => item.id !== material.id));
      if (selectedId === material.id) setSelectedId(null);
    }
    setDeletingId(null);
  };

  const rotatePage = async (materialId: string, page: MaterialPage, amount: number) => {
    const rotation = (page.rotation + amount + 360) % 360;
    setMaterials((current) =>
      current.map((material) =>
        material.id === materialId
          ? {
              ...material,
              pages: material.pages.map((item) =>
                item.id === page.id ? { ...item, rotation } : item,
              ),
            }
          : material,
      ),
    );
    const { error } = await supabase!
      .from("material_paginas")
      .update({ rotation })
      .eq("id", page.id);
    if (error) {
      setStatus(error.message);
      void loadMaterials();
    }
  };

  const toggleCorrected = async (materialId: string, page: MaterialPage) => {
    const corrected = !page.corrected;
    setMaterials((current) =>
      current.map((material) =>
        material.id === materialId
          ? {
              ...material,
              pages: material.pages.map((item) =>
                item.id === page.id ? { ...item, corrected } : item,
              ),
            }
          : material,
      ),
    );
    const { error } = await supabase!
      .from("material_paginas")
      .update({ corrected })
      .eq("id", page.id);
    if (error) {
      setStatus(error.message);
      void loadMaterials();
    }
  };

  const navigateZoom = (direction: number) => {
    if (visibleZoomedPageIndex === -1) return;
    const nextIndex =
      (visibleZoomedPageIndex + direction + visiblePages.length) % visiblePages.length;
    setZoomedPageId(visiblePages[nextIndex].id);
  };

  const zoomImageStyle = (() => {
    if (!zoomedPage || !zoomImageSize || !zoomBounds.width || !zoomBounds.height) {
      return { transform: `rotate(${zoomedPage?.rotation ?? 0}deg)` };
    }
    const sideways = zoomedPage.rotation === 90 || zoomedPage.rotation === 270;
    const rotatedWidth = sideways ? zoomImageSize.height : zoomImageSize.width;
    const rotatedHeight = sideways ? zoomImageSize.width : zoomImageSize.height;
    const scale = Math.min(zoomBounds.width / rotatedWidth, zoomBounds.height / rotatedHeight);
    return {
      width: `${zoomImageSize.width * scale}px`,
      height: `${zoomImageSize.height * scale}px`,
      transform: `rotate(${zoomedPage.rotation}deg)`,
    };
  })();

  const pdfGeneratingOverlay = generatingProgress && (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Gerando PDF"
    >
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-2xl">
        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <h3 className="mt-4 text-xl font-bold">Gerando seu PDF</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Preparando página {generatingProgress.current} de {generatingProgress.total}.
        </p>
        <div
          className="mt-4 h-3 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={generatingProgress.total}
          aria-valuenow={generatingProgress.current}
          aria-label="Progresso da geração do PDF"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${(generatingProgress.current / generatingProgress.total) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );

  if (loadingMaterials) {
    return (
      <section className={`${box} max-w-5xl`} aria-live="polite">
        <button onClick={back} className="underline">
          Voltar às provas
        </button>
        <div className="grid min-h-72 place-items-center text-center">
          <div>
            <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <h2 className="mt-4 text-xl font-bold">Carregando materiais</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Buscando os conjuntos e preparando as páginas.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (selected) {
    return (
      <section className={`${box} max-w-5xl`}>
        <button onClick={() => setSelectedId(null)} className="underline">
          Voltar aos materiais
        </button>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">📄 {selected.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Arraste as imagens ou informe o número da página para reorganizar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              Ocultar corrigidas
              <button
                type="button"
                role="switch"
                aria-checked={hideCorrected}
                onClick={() => setHideCorrected((current) => !current)}
                className={`relative h-7 w-12 rounded-full transition ${hideCorrected ? "bg-primary" : "bg-muted-foreground/40"}`}
              >
                <span
                  className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-card shadow transition-transform ${hideCorrected ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </label>
            <button
              disabled={generatingId === selected.id}
              onClick={() => void generatePdf(selected)}
              className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-60"
            >
              {generatingId === selected.id ? "Gerando PDF..." : "📄 Gerar PDF"}
            </button>
          </div>
        </div>
        {status && (
          <p
            role="alert"
            className={`mt-4 rounded-xl p-3 text-sm ${status === "PDF gerado com sucesso." ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}
          >
            {status}
          </p>
        )}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePages.map((page) => {
            const pageIndex = selected.pages.findIndex((item) => item.id === page.id);
            return (
              <article
                key={page.id}
                draggable
                onDragStart={() => setDraggedPageId(page.id)}
                onDragEnd={() => {
                  setDraggedPageId(null);
                  setDropTargetId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggedPageId && draggedPageId !== page.id) setDropTargetId(page.id);
                }}
                onDrop={() => {
                  if (draggedPageId) movePage(selected, draggedPageId, pageIndex);
                  setDraggedPageId(null);
                  setDropTargetId(null);
                }}
                className={`relative overflow-hidden rounded-2xl border bg-card transition ${
                  draggedPageId === page.id
                    ? "opacity-50"
                    : dropTargetId === page.id
                      ? "border-primary ring-2 ring-primary/30"
                      : "hover:border-primary"
                }`}
              >
                {dropTargetId === page.id && (
                  <div className="absolute inset-x-0 top-0 z-10 bg-primary py-1 text-center text-xs font-bold text-primary-foreground">
                    Soltar aqui
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setZoomedPageId(page.id)}
                  className="group relative block w-full overflow-hidden bg-muted"
                  aria-label={`Ampliar imagem ${page.image_name}`}
                >
                  <img
                    src={page.previewUrl}
                    alt={page.image_name}
                    className="h-48 w-full object-contain transition-transform"
                    style={{ transform: `rotate(${page.rotation}deg)` }}
                  />
                  <span className="absolute inset-0 grid place-items-center bg-slate-950/45 text-sm font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    🔍 Ampliar
                  </span>
                </button>
                <div className="flex items-center gap-3 p-3">
                  <span className="cursor-grab text-lg" aria-label="Arraste para reorganizar">
                    ⠿
                  </span>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    Página
                    <input
                      type="number"
                      min="1"
                      value={pageNumbers[page.id] ?? String(page.position)}
                      onChange={(event) =>
                        setPageNumbers((current) => ({ ...current, [page.id]: event.target.value }))
                      }
                      onBlur={(event) => {
                        commitPageNumber(selected, page, event.target.value);
                      }}
                      className="w-16 rounded-lg border p-2 text-center"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="Girar imagem 90 graus para a esquerda"
                    title="Girar 90 graus para a esquerda"
                    onClick={() => void rotatePage(selected.id, page, -90)}
                    className="rounded-lg border px-2 py-1 text-lg transition hover:bg-muted"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    aria-label="Girar imagem 90 graus para a direita"
                    title="Girar 90 graus para a direita"
                    onClick={() => void rotatePage(selected.id, page, 90)}
                    className="rounded-lg border px-2 py-1 text-lg transition hover:bg-muted"
                  >
                    ↷
                  </button>
                  <span
                    className="min-w-0 truncate text-sm text-muted-foreground"
                    title={page.image_name}
                  >
                    {page.image_name}
                  </span>
                  {page.corrected && (
                    <span className="text-xs font-bold text-success">✓ Corrigida</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {visiblePages.length === 0 && (
          <p className="mt-6 rounded-xl bg-muted p-5 text-center text-muted-foreground">
            Todas as páginas deste material estão corrigidas.
          </p>
        )}
        {zoomedPage && magnifier && (
          <div
            className="pointer-events-none fixed z-[60] h-[5cm] w-[5cm] overflow-hidden rounded-full border-4 border-primary bg-card shadow-2xl"
            aria-hidden="true"
            style={{
              left: magnifier.cursorX,
              top: magnifier.cursorY,
              transform: "translate(-50%, -50%)",
            }}
          >
            <img
              src={magnifier.url}
              alt=""
              className="absolute max-w-none"
              style={{
                width: `${magnifier.width * 3}px`,
                height: `${magnifier.height * 3}px`,
                left: `calc(2.5cm - ${magnifier.imageX * 3}px)`,
                top: `calc(2.5cm - ${magnifier.imageY * 3}px)`,
                transform: `rotate(${magnifier.rotation}deg)`,
                transformOrigin: `${magnifier.imageX * 3}px ${magnifier.imageY * 3}px`,
              }}
            />
          </div>
        )}
        {zoomedPage && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4"
            role="presentation"
            onMouseDown={() => setZoomedPageId(null)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label={`Imagem ${visibleZoomedPageIndex + 1} de ${visiblePages.length}`}
              className="relative flex h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-card p-4 shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {visibleZoomedPageIndex + 1}/{visiblePages.length} · {zoomedPage.image_name}
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={zoomedPage.corrected}
                    onClick={() => void toggleCorrected(selected.id, zoomedPage)}
                    className={`rounded-lg px-3 py-2 text-sm font-bold transition ${zoomedPage.corrected ? "bg-success/15 text-success" : "border hover:bg-muted"}`}
                  >
                    {zoomedPage.corrected ? "✓ Corrigida" : "Marcar corrigida"}
                  </button>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    Página
                    <input
                      type="number"
                      min="1"
                      value={pageNumbers[zoomedPage.id] ?? String(zoomedPage.position)}
                      onChange={(event) =>
                        setPageNumbers((current) => ({
                          ...current,
                          [zoomedPage.id]: event.target.value,
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitPageNumber(selected, zoomedPage, event.currentTarget.value);
                        }
                      }}
                      className="w-16 rounded-lg border p-2 text-center"
                      aria-label="Número da página"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void rotatePage(selected.id, zoomedPage, -90)}
                    className="rounded-lg border px-3 py-2 text-lg transition hover:bg-muted"
                    aria-label="Girar imagem 90 graus para a esquerda"
                    title="Girar 90 graus para a esquerda"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    onClick={() => void rotatePage(selected.id, zoomedPage, 90)}
                    className="rounded-lg border px-3 py-2 text-lg transition hover:bg-muted"
                    aria-label="Girar imagem 90 graus para a direita"
                    title="Girar 90 graus para a direita"
                  >
                    ↷
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomedPageId(null)}
                    className="rounded-lg border px-3 py-2 font-bold transition hover:bg-muted"
                    aria-label="Fechar imagem ampliada"
                  >
                    Fechar
                  </button>
                </div>
              </div>
              <div
                ref={zoomContainerRef}
                className="relative mt-4 flex h-[calc(100vh-10rem)] max-h-[calc(100dvh-10rem)] min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-muted p-2"
              >
                <img
                  src={zoomedPage.previewUrl}
                  alt={zoomedPage.image_name}
                  className="object-contain transition-transform"
                  onMouseMove={(event) => {
                    if (!zoomedPage.previewUrl) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const visualX = event.clientX - bounds.left;
                    const visualY = event.clientY - bounds.top;
                    const sideways = zoomedPage.rotation === 90 || zoomedPage.rotation === 270;
                    const width = sideways ? bounds.height : bounds.width;
                    const height = sideways ? bounds.width : bounds.height;
                    let imageX = visualX;
                    let imageY = visualY;
                    if (zoomedPage.rotation === 90) {
                      imageX = visualY;
                      imageY = height - visualX;
                    } else if (zoomedPage.rotation === 180) {
                      imageX = width - visualX;
                      imageY = height - visualY;
                    } else if (zoomedPage.rotation === 270) {
                      imageX = width - visualY;
                      imageY = visualX;
                    }
                    setMagnifier({
                      url: zoomedPage.previewUrl,
                      cursorX: event.clientX,
                      cursorY: event.clientY,
                      imageX,
                      imageY,
                      width,
                      height,
                      rotation: zoomedPage.rotation,
                    });
                  }}
                  onMouseLeave={() => setMagnifier(null)}
                  onLoad={(event) =>
                    setZoomImageSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })
                  }
                  style={zoomImageStyle}
                />
                {visiblePages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => navigateZoom(-1)}
                      className="absolute left-3 rounded-full bg-card/90 px-4 py-3 text-xl font-bold shadow transition hover:bg-card"
                      aria-label="Imagem anterior"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => navigateZoom(1)}
                      className="absolute right-3 rounded-full bg-card/90 px-4 py-3 text-xl font-bold shadow transition hover:bg-card"
                      aria-label="Próxima imagem"
                    >
                      →
                    </button>
                  </>
                )}
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Use as setas do teclado para navegar e Esc para fechar.
              </p>
            </section>
          </div>
        )}
        {pdfGeneratingOverlay}
      </section>
    );
  }

  return (
    <section className={`${box} max-w-5xl`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={back} className="underline">
            Voltar às provas
          </button>
          <h2 className="mt-4 text-2xl font-bold">Materiais em PDF</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie um conjunto de imagens, organize as páginas e gere o PDF.
          </p>
        </div>
        <button
          onClick={() => {
            setCreating(true);
            setStatus("");
          }}
          className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground"
        >
          + Novo material
        </button>
      </div>
      {creating && (
        <div className="mt-6 rounded-2xl border bg-muted/40 p-5">
          <h3 className="text-lg font-bold">Novo conjunto de imagens</h3>
          <label className="mt-4 block text-sm font-semibold">
            Nome do material
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Ex.: Capítulo 1 - História"
              className="mt-1 w-full rounded-xl border bg-card p-3"
            />
          </label>
          <label
            className={`mt-4 block cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition ${
              isFileDragging ? "border-primary bg-primary/10" : "hover:border-primary"
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsFileDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setIsFileDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsFileDragging(false);
              selectImages(event.dataTransfer.files);
            }}
          >
            <span className="font-semibold">Arraste as imagens para cá</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              ou clique para selecionar várias imagens de uma vez.
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(event) => selectImages(event.target.files ?? [])}
            />
          </label>
          {files.length > 0 && (
            <p className="mt-3 text-sm font-medium">
              {files.length} imagem(ns) selecionada(s): {files.map((file) => file.name).join(", ")}
            </p>
          )}
          {saving && (
            <div className="mt-4" aria-live="polite">
              <div className="flex justify-between text-sm font-semibold">
                <span>Enviando imagens</span>
                <span>
                  {uploadedCount}/{files.length}
                </span>
              </div>
              <div
                className="mt-2 h-3 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={files.length}
                aria-valuenow={uploadedCount}
                aria-label="Progresso do envio das imagens"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${files.length ? (uploadedCount / files.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
          {status && (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            >
              {status}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => {
                setCreating(false);
                setStatus("");
              }}
              className="rounded-xl border px-5 py-3"
            >
              Cancelar
            </button>
            <button
              disabled={saving}
              onClick={() => void saveMaterial()}
              className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar material"}
            </button>
          </div>
        </div>
      )}
      {!creating && materials.length === 0 && (
        <p className="mt-8 rounded-xl bg-muted p-5 text-muted-foreground">
          Nenhum material criado ainda.
        </p>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {materials.map((material) => (
          <article key={material.id} className="rounded-2xl border p-5">
            <h3 className="font-bold">📄 {material.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {material.pages.length} página(s) · {date(material.created_at)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setStatus("");
                  setSelectedId(material.id);
                }}
                className="rounded-xl border px-4 py-2 text-sm font-bold transition hover:bg-muted"
              >
                Organizar
              </button>
              <button
                disabled={!material.pages.length || generatingId === material.id}
                onClick={() => void generatePdf(material)}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
              >
                {generatingId === material.id ? "Gerando..." : "📄 Gerar PDF"}
              </button>
              <button
                type="button"
                aria-label={`Apagar material ${material.name}`}
                title="Apagar material"
                disabled={deletingId === material.id}
                onClick={() => void deleteMaterial(material)}
                className="rounded-xl border border-destructive p-2 text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </article>
        ))}
      </div>
      {status && !creating && (
        <p
          role="alert"
          className={`mt-4 rounded-xl p-3 text-sm ${status === "PDF gerado com sucesso." ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"}`}
        >
          {status}
        </p>
      )}
      {pdfGeneratingOverlay}
    </section>
  );
}
