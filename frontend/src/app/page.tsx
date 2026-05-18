export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-stone-50">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-stone-800">智伴方舟</h1>
        <p className="text-stone-500">Intelligent Ark - AI 心理陪伴与风险预警平台</p>
        <div className="flex gap-4 justify-center pt-4">
          <a
            href="/chat"
            className="px-6 py-3 bg-orange-400 text-white rounded-lg hover:bg-orange-500 transition-colors font-medium"
          >
            进入 C端聊天
          </a>
          <a
            href="/admin"
            className="px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium"
          >
            进入 B端大屏
          </a>
        </div>
      </div>
    </main>
  );
}
