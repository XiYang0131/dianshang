"use client";

import Hero from "@/components/ui/animated-shader-hero";

const AnimatedShaderHeroDemo: React.FC = () => {
  const handlePrimaryClick = () => {
    console.log("Get Started clicked!");
  };

  const handleSecondaryClick = () => {
    console.log("Explore Features clicked!");
  };

  return (
    <div className="w-full">
      <Hero
        trustBadge={{
          text: "Trusted by forward-thinking teams.",
          icons: ["✨"]
        }}
        headline={{
          line1: "Launch Your",
          line2: "Workflow Into Orbit"
        }}
        subtitle="Supercharge productivity with AI-powered automation and integrations built for the next generation of teams - fast, seamless, and limitless."
        buttons={{
          primary: {
            text: "Get Started for Free",
            onClick: handlePrimaryClick
          },
          secondary: {
            text: "Explore Features",
            onClick: handleSecondaryClick
          }
        }}
      />

      <div className="bg-gray-100 p-8">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-4 text-3xl font-bold text-gray-800">How to Use the Hero Component</h2>
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <pre className="overflow-x-auto text-sm text-gray-600">
              {`<Hero
  trustBadge={{
    text: "Your trust badge text",
    icons: ["🚀", "⭐", "✨"] // optional
  }}
  headline={{
    line1: "Your First Line",
    line2: "Your Second Line"
  }}
  subtitle="Your compelling subtitle text goes here..."
  buttons={{
    primary: {
      text: "Primary CTA",
      onClick: handlePrimaryClick
    },
    secondary: {
      text: "Secondary CTA",
      onClick: handleSecondaryClick
    }
  }}
  className="custom-classes" // optional
/>`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnimatedShaderHeroDemo;
