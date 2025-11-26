from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import openai

app = Flask(__name__)
CORS(app)

# Set your API key (recommended: use environment variable)
openai.api_key = os.getenv("OPENAI_API_KEY")

@app.route("/")
def home():
    return {"status": "AI Productivity Coach Backend Running"}

@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        data = request.json
        productivity_data = data.get("usage", [])

        if not productivity_data:
            return jsonify({"error": "No data provided"}), 400

        # Convert usage to readable text
        usage_text = "\n".join(
            [f"{item['domain']} → {item['time']} minutes" for item in productivity_data]
        )

        prompt = f"""
You are an AI Productivity Coach. Analyze the following website usage for a student:

{usage_text}

Give:
1. Productivity score (0–100)
2. Short analysis
3. Actionable improvements (3 bullet points)
Keep it under 120 words.
"""

        response = openai.chat.completions.create(
            model="gpt-4.1-mini",  # or gpt-3.5-turbo if needed
            messages=[{"role": "user", "content": prompt}]
        )

        ai_output = response.choices[0].message.content

        return jsonify({"analysis": ai_output})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
