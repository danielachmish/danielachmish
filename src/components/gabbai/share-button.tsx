// Server-rendered form: submits in a new tab and lands in the gabbai's own WhatsApp with the text ready.
export function ShareToWhatsAppButton({ congregantId, label = "שליחה מהוואטסאפ שלי", compact = false }: { congregantId: string; label?: string; compact?: boolean }) {
  return (
    <form method="post" action="/api/share/whatsapp" target="_blank">
      <input type="hidden" name="congregantId" value={congregantId} />
      <button
        className={`inline-flex items-center justify-center gap-2 bg-[#1f8f4e] font-medium text-white shadow-sm hover:bg-[#187a42] ${compact ? "min-h-9 rounded-lg px-3 text-sm" : "min-h-11 w-full rounded-xl px-4 sm:w-auto"}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z" /></svg>
        {label}
      </button>
    </form>
  );
}
