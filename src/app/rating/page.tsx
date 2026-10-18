"use client";

import { useState } from "react";
import { useNotifications } from "@/context/NotificationContext";
import { useLanguage } from "@/context/LanguageContext";

export default function RatingPage() {
  const [overallRating, setOverallRating] = useState(0);
  const [predictionRating, setPredictionRating] = useState(0);
  const [uiRating, setUiRating] = useState(0);
  const [supportRating, setSupportRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotifications();
  const { text } = useLanguage();

  const Star = ({ filled, onClick }: { filled: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`w-8 h-8 transition transform hover:scale-110 ${filled ? "text-yellow-400" : "text-gray-600"}`}
    >
      <svg
        className="w-full h-full"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
        />
      </svg>
    </button>
  );

  const StarRating = ({ rating, setRating }: { rating: number; setRating: (value: number) => void }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          filled={star <= rating}
          onClick={() => setRating(star)}
        />
      ))}
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (overallRating === 0) {
      addNotification(text("Veuillez donner une note globale", "Please provide an overall rating"), "warning");
      return;
    }

    setLoading(true);

    // Simulate API call
    setTimeout(() => {
      addNotification(text("Merci pour votre évaluation !", "Thank you for your feedback!"), "success");
      setOverallRating(0);
      setPredictionRating(0);
      setUiRating(0);
      setSupportRating(0);
      setComment("");
      setLoading(false);
    }, 1000);
  };

  const averageRating = (
    (overallRating + predictionRating + uiRating + supportRating) / 4
  ).toFixed(1);

  return (
    <div className="min-h-screen bg-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12 animate-slide-down">
          <h1 className="text-4xl font-bold text-white mb-4">
            {text("Notez IkProno", "Rate IkProno")}
          </h1>
          <p className="text-gray-400 text-lg">
            {text("Votre avis nous aide à améliorer notre service", "Your feedback helps us improve our service")}
          </p>
        </div>

        {/* Rating Form */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 mb-8 animate-slide-up">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Overall Rating */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">
                {text("Note globale", "Overall rating")} *
              </label>
              <div className="flex items-center gap-4">
                <StarRating rating={overallRating} setRating={setOverallRating} />
                <span className="text-2xl font-bold text-white">{overallRating}/5</span>
              </div>
            </div>

            {/* Detailed Ratings */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  {text("Qualité des prédictions", "Prediction quality")}
                </label>
                <div className="flex items-center gap-4">
                  <StarRating rating={predictionRating} setRating={setPredictionRating} />
                  <span className="text-lg text-gray-400">{predictionRating}/5</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  {text("Interface utilisateur", "User interface")}
                </label>
                <div className="flex items-center gap-4">
                  <StarRating rating={uiRating} setRating={setUiRating} />
                  <span className="text-lg text-gray-400">{uiRating}/5</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  {text("Support client", "Customer support")}
                </label>
                <div className="flex items-center gap-4">
                  <StarRating rating={supportRating} setRating={setSupportRating} />
                  <span className="text-lg text-gray-400">{supportRating}/5</span>
                </div>
              </div>
            </div>

            {/* Comment */}
            <div>
              <label htmlFor="comment" className="block text-sm font-medium text-gray-300 mb-3">
                {text("Commentaire (optionnel)", "Comment (optional)")}
              </label>
              <textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-gray-800 text-white transition resize-none"
                placeholder={text("Partagez votre expérience avec IkProno...", "Share your experience with IkProno...")}
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white px-6 py-4 rounded-lg font-semibold transition hover-glow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? text("Envoi en cours...", "Sending...") : text("Envoyer mon évaluation", "Submit my review")}
            </button>
          </form>
        </div>

        {/* Average Rating Display */}
        {overallRating > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center animate-slide-up">
            <h3 className="text-lg font-semibold text-white mb-2">{text("Votre note moyenne", "Your average rating")}</h3>
            <div className="text-5xl font-bold text-green-500 mb-2">{averageRating}</div>
            <p className="text-gray-400">{text("sur 5 étoiles", "out of 5 stars")}</p>
          </div>
        )}

        {/* Reviews Summary */}
        <div className="mt-8 animate-slide-up">
          <h2 className="text-2xl font-bold text-white mb-6">{text("Avis récents", "Recent reviews")}</h2>
          <div className="space-y-4">
            {[
              {
                name: "Marie D.",
                rating: 5,
                comment: text("Excellent service ! Les prédictions sont très fiables et l'interface est intuitive.", "Excellent service! The predictions are very reliable and the interface is intuitive."),
                date: text("Il y a 2 jours", "2 days ago")
              },
              {
                name: "Pierre L.",
                rating: 4,
                comment: text("Très bonne application, j'ai gagné plusieurs fois grâce aux prédictions IA.", "Great app, I've won several times thanks to the AI predictions."),
                date: text("Il y a 5 jours", "5 days ago")
              },
              {
                name: "Jean M.",
                rating: 5,
                comment: text("Le support est réactif et les prédictions sont détaillées. Je recommande !", "Support is responsive and predictions are detailed. I recommend it!"),
                date: text("Il y a 1 semaine", "1 week ago")
              }
            ].map((review, index) => (
              <div
                key={index}
                className="bg-gray-900 border border-gray-800 rounded-lg p-6 card-hover"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                      <span className="text-green-500 font-semibold">{review.name[0]}</span>
                    </div>
                    <div>
                      <h4 className="text-white font-semibold">{review.name}</h4>
                      <p className="text-gray-500 text-sm">{review.date}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        className={`w-4 h-4 ${star <= review.rating ? "text-yellow-400" : "text-gray-600"}`}
                        fill={star <= review.rating ? "currentColor" : "none"}
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                        />
                      </svg>
                    ))}
                  </div>
                </div>
                <p className="text-gray-400">{review.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
