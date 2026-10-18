export default function AnalysisSection() {
  const articles = [
    {
      id: 1,
      title: "L'IA révolutionne les prédictions sportives",
      excerpt: "Découvrez comment l'intelligence artificielle transforme l'analyse des matchs et améliore les prédictions.",
      category: "Technologie",
      date: "14 Oct 2026",
      readTime: "5 min",
      image: "🤖",
      gradient: "from-purple-600 to-blue-600"
    },
    {
      id: 2,
      title: "Stratégies de paris basées sur les données",
      excerpt: "Apprenez à utiliser les statistiques avancées pour optimiser vos décisions de paris.",
      category: "Stratégie",
      date: "13 Oct 2026",
      readTime: "7 min",
      image: "📈",
      gradient: "from-green-600 to-teal-600"
    },
    {
      id: 3,
      title: "Analyse : L'impact de la forme récente",
      excerpt: "Pourquoi les performances des 5 derniers matchs sont cruciales pour vos prédictions.",
      category: "Analyse",
      date: "12 Oct 2026",
      readTime: "4 min",
      image: "⚽",
      gradient: "from-orange-600 to-red-600"
    },
    {
      id: 4,
      title: "Comprendre les cotes et la valeur attendue",
      excerpt: "Guide complet pour interpréter les cotes et identifier les paris à valeur positive.",
      category: "Éducation",
      date: "11 Oct 2026",
      readTime: "6 min",
      image: "💰",
      gradient: "from-yellow-600 to-orange-600"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {articles.map((article, index) => {
        const staggerClass = index === 0 ? 'stagger-1' : index === 1 ? 'stagger-2' : index === 2 ? 'stagger-3' : 'stagger-4';
        return (
          <article
            key={article.id}
            className={`bg-gray-900 border border-gray-800 rounded-xl hover:border-green-600 transition-all duration-300 overflow-hidden cursor-pointer card-hover animate-slide-up ${staggerClass}`}
          >
            <div className={`h-40 bg-gradient-to-br ${article.gradient} flex items-center justify-center animate-gradient`}>
              <span className="text-6xl animate-bounce">{article.image}</span>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="bg-green-500/20 text-green-400 text-xs px-3 py-1 rounded-full animate-pulse">
                  {article.category}
                </span>
                <span className="text-gray-400 text-xs">
                  {article.readTime} de lecture
                </span>
              </div>
              <h4 className="text-xl font-bold text-white mb-2 hover:text-green-500 transition">
                {article.title}
              </h4>
              <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                {article.excerpt}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">{article.date}</span>
                <span className="text-green-500 text-sm font-semibold hover:underline">
                  Lire plus →
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
