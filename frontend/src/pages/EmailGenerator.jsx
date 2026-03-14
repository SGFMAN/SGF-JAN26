import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import logo from "../images/logo.png";

const MONUMENT = "#323233";
const SECTION_GREY = "#a1a1a3";
const LIGHT_MONUMENT = "#42464d";
const WHITE = "#fff";
const API_URL = "";

export default function EmailGenerator() {
  const [inputText, setInputText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState(null);
  
  // AI Workflow State
  const [workflowState, setWorkflowState] = useState("idle"); // idle, answering, review
  const [analysisResult, setAnalysisResult] = useState(null);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [finalDraft, setFinalDraft] = useState(null);
  
  // Suggestion state
  const [suggestions, setSuggestions] = useState({}); // Map of pointIndex -> suggestion data
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  
  // Modal states
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const handleStartAnalysis = async () => {
    if (!inputText.trim()) {
      setError("Please paste some text to analyze");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/email-generator/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: inputText.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ 
          error: response.status === 503 
            ? "OpenAI API key not configured. Please contact your administrator."
            : `Server error: ${response.status}` 
        }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.points || data.points.length === 0) {
        throw new Error("No response points were generated");
      }

      setAnalysisResult(data);
      setAnswers(new Array(data.points.length).fill(""));
      setSuggestions({});
      setCurrentPointIndex(0);
      setWorkflowState("answering");
      setShowAnswerModal(true);
      
      // Fetch suggestion for first point
      fetchSuggestion(data.points[0].question, 0);
    } catch (err) {
      console.error("Error analyzing text:", err);
      setError(err.message || "Failed to analyze text. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnswerChange = (value) => {
    const newAnswers = [...answers];
    newAnswers[currentPointIndex] = value;
    setAnswers(newAnswers);
  };

  // Fetch suggestion for a question
  const fetchSuggestion = async (question, pointIndex) => {
    if (!question || question.trim().length === 0) return;

    setLoadingSuggestions(true);
    try {
      const response = await fetch(`${API_URL}/api/email-generator/suggest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.suggested) {
          setSuggestions(prev => ({
            ...prev,
            [pointIndex]: data,
          }));
        } else {
          setSuggestions(prev => {
            const newSuggestions = { ...prev };
            delete newSuggestions[pointIndex];
            return newSuggestions;
          });
        }
      }
    } catch (err) {
      console.error("Error fetching suggestion:", err);
      // Don't show error to user, just continue without suggestion
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Accept suggestion and move to next point
  const handleAcceptSuggestion = async () => {
    const suggestion = suggestions[currentPointIndex];
    if (suggestion && suggestion.answer) {
      handleAnswerChange(suggestion.answer);
      // Automatically move to next point after accepting
      await handleNext();
    }
  };

  // Use suggestion as starting point (pre-fill but allow editing)
  const handleUseSuggestion = () => {
    const suggestion = suggestions[currentPointIndex];
    if (suggestion && suggestion.answer) {
      handleAnswerChange(suggestion.answer);
    }
  };

  // Ignore suggestion
  const handleIgnoreSuggestion = () => {
    setSuggestions(prev => {
      const newSuggestions = { ...prev };
      delete newSuggestions[currentPointIndex];
      return newSuggestions;
    });
  };

  const handleNext = async () => {
    // Save current answer before moving
    if (answers[currentPointIndex] && answers[currentPointIndex].trim()) {
      await saveAnswer(analysisResult.points[currentPointIndex].question, answers[currentPointIndex]);
    }

    if (currentPointIndex < analysisResult.points.length - 1) {
      const nextIndex = currentPointIndex + 1;
      setCurrentPointIndex(nextIndex);
      // Fetch suggestion for next point
      fetchSuggestion(analysisResult.points[nextIndex].question, nextIndex);
    } else {
      // Last point - finish and compile
      handleFinish();
    }
  };

  const handleBack = async () => {
    // Save current answer before going back
    if (answers[currentPointIndex] && answers[currentPointIndex].trim()) {
      await saveAnswer(analysisResult.points[currentPointIndex].question, answers[currentPointIndex]);
    }

    if (currentPointIndex > 0) {
      const prevIndex = currentPointIndex - 1;
      setCurrentPointIndex(prevIndex);
      // Fetch suggestion for previous point if not already loaded
      if (!suggestions[prevIndex]) {
        fetchSuggestion(analysisResult.points[prevIndex].question, prevIndex);
      }
    }
  };

  const handleSkip = () => {
    handleAnswerChange("");
    if (currentPointIndex < analysisResult.points.length - 1) {
      setCurrentPointIndex(currentPointIndex + 1);
    } else {
      handleFinish();
    }
  };

  // Save answer to learned_answers database
  const saveAnswer = async (question, answer) => {
    if (!question || !answer || !question.trim() || !answer.trim()) return;

    try {
      await fetch(`${API_URL}/api/email-generator/save-answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: question.trim(),
          answer: answer.trim(),
        }),
      });
      // Silently save, don't show errors to user
    } catch (err) {
      console.error("Error saving answer:", err);
      // Don't show error to user, just log it
    }
  };

  const handleFinish = async () => {
    // Save current answer before finishing
    if (answers[currentPointIndex] && answers[currentPointIndex].trim()) {
      await saveAnswer(analysisResult.points[currentPointIndex].question, answers[currentPointIndex]);
    }

    // Save all answers
    for (let i = 0; i < analysisResult.points.length; i++) {
      if (answers[i] && answers[i].trim()) {
        await saveAnswer(analysisResult.points[i].question, answers[i]);
      }
    }

    setIsCompiling(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/email-generator/compile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          points: analysisResult.points,
          answers: answers,
          originalText: inputText,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to compile email" }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setFinalDraft(data);
      setWorkflowState("review");
      setShowAnswerModal(false);
      setShowReviewModal(true);
    } catch (err) {
      console.error("Error compiling email:", err);
      setError(err.message || "Failed to compile email draft. Please try again.");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleReset = () => {
    setInputText("");
    setWorkflowState("idle");
    setAnalysisResult(null);
    setCurrentPointIndex(0);
    setAnswers([]);
    setFinalDraft(null);
    setSuggestions({});
    setShowAnswerModal(false);
    setShowReviewModal(false);
    setError(null);
  };

  const currentPoint = analysisResult?.points?.[currentPointIndex];
  const isLastPoint = currentPointIndex === (analysisResult?.points?.length || 0) - 1;
  const canProceed = answers[currentPointIndex]?.trim() || false;

  return (
    <div
      className="page-container"
      style={{
        position: "fixed",
        inset: 0,
        background: LIGHT_MONUMENT,
        minHeight: "100vh",
        width: "100vw",
        overflowY: "auto",
      }}
    >
      {/* Section 1: Heading */}
      <div
        style={{
          margin: "32px auto 24px auto",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: "0 32px",
          boxSizing: "border-box",
        }}
      >
        <img
          src={logo}
          alt="SGF Logo"
          style={{
            width: "120px",
            height: "auto",
            position: "absolute",
            left: "40px",
          }}
        />
        <div style={{ display: "flex", alignItems: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.4rem",
              fontWeight: 700,
              color: WHITE,
              letterSpacing: "1px",
            }}
          >
            Email Generator
          </h1>
        </div>
      </div>

      {/* Sections 2 & 3 */}
      <div
        className="sections-container"
        style={{
          display: "flex",
          width: "calc(100vw - 64px)",
          maxWidth: "100%",
          margin: "50px auto 0 auto",
          gap: "32px",
        }}
      >
        {/* Section 2: Menu */}
        <div
          className="sidebar-menu"
          style={{
            background: SECTION_GREY,
            borderRadius: "16px",
            width: "200px",
            minWidth: "200px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            padding: "32px 12px",
            boxSizing: "border-box",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: "18px",
            color: MONUMENT,
            overflowY: "auto",
          }}
        >
          <div style={{ flex: 1 }} />

          {/* Back to Main */}
          <Link
            to="/projects"
            style={{
              background: WHITE,
              color: MONUMENT,
              border: "none",
              borderRadius: "10px",
              padding: "13px 8px",
              fontSize: "1.05rem",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.5px",
              cursor: "pointer",
              transition: "background 0.17s",
              marginBottom: "4px",
              display: "block",
            }}
          >
            ← Back to Main
          </Link>
        </div>

        {/* Section 3: Main Content */}
        <div
          className="content-section"
          style={{
            background: SECTION_GREY,
            borderRadius: "18px",
            flex: 1,
            minHeight: "758px",
            height: "758px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
            padding: "24px 32px",
            boxSizing: "border-box",
            overflow: "auto",
            color: MONUMENT,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "32px",
              flex: 1,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <h2
              style={{
                fontSize: "1.8rem",
                fontWeight: 600,
                color: MONUMENT,
                margin: "0 0 24px 0",
              }}
            >
              AI-Assisted Email Response Generator
            </h2>

            {error && (
              <div
                style={{
                  background: "#fee",
                  border: "1px solid #fcc",
                  borderRadius: "8px",
                  padding: "12px 16px",
                  marginBottom: "20px",
                  color: "#c33",
                }}
              >
                {error}
              </div>
            )}

            {workflowState === "idle" && (
              <>
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.9rem",
                      color: "#32323399",
                      marginBottom: "6px",
                      fontWeight: 500,
                    }}
                  >
                    Paste incoming email, legal text, or other message:
                  </label>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste the text you want to respond to here..."
                    style={{
                      width: "100%",
                      minHeight: "300px",
                      padding: "12px",
                      borderRadius: "8px",
                      border: `1px solid ${SECTION_GREY}`,
                      fontSize: "0.95rem",
                      color: MONUMENT,
                      background: WHITE,
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                </div>
                <button
                  onClick={handleStartAnalysis}
                  disabled={isAnalyzing || !inputText.trim()}
                  style={{
                    background: isAnalyzing || !inputText.trim() ? SECTION_GREY : MONUMENT,
                    color: WHITE,
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 24px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: isAnalyzing || !inputText.trim() ? "not-allowed" : "pointer",
                    transition: "background 0.2s",
                    alignSelf: "flex-start",
                  }}
                >
                  {isAnalyzing ? "Analyzing..." : "Start AI Review"}
                </button>
              </>
            )}

            {workflowState === "answering" && !showAnswerModal && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <p style={{ color: MONUMENT, fontSize: "1rem", marginBottom: "20px" }}>
                  Please answer the questions in the modal to continue.
                </p>
                <button
                  onClick={() => setShowAnswerModal(true)}
                  style={{
                    background: MONUMENT,
                    color: WHITE,
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 24px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Continue Answering
                </button>
              </div>
            )}

            {workflowState === "review" && !showReviewModal && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <p style={{ color: MONUMENT, fontSize: "1rem", marginBottom: "20px" }}>
                  Email draft is ready for review.
                </p>
                <button
                  onClick={() => setShowReviewModal(true)}
                  style={{
                    background: MONUMENT,
                    color: WHITE,
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 24px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    marginRight: "12px",
                  }}
                >
                  View Draft
                </button>
                <button
                  onClick={handleReset}
                  style={{
                    background: SECTION_GREY,
                    color: MONUMENT,
                    border: "none",
                    borderRadius: "8px",
                    padding: "12px 24px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Start Over
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Answer Modal */}
      {showAnswerModal && currentPoint && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              // Don't close on outside click - user must use buttons
            }
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "600px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>
                Point {currentPointIndex + 1} of {analysisResult.points.length}
              </h2>
              <button
                onClick={() => {
                  if (window.confirm("Are you sure you want to cancel? Your progress will be lost.")) {
                    handleReset();
                  }
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: MONUMENT,
                  padding: "0",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <div
                style={{
                  background: "#f5f5f5",
                  borderRadius: "8px",
                  padding: "12px",
                  marginBottom: "16px",
                  fontSize: "0.9rem",
                  color: "#666",
                }}
              >
                <strong>Context:</strong> {currentPoint.sourceText}
              </div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  color: "#32323399",
                  marginBottom: "6px",
                  fontWeight: 500,
                }}
              >
                {currentPoint.question}
              </label>
              
              {/* Suggestion Display */}
              {loadingSuggestions && (
                <div
                  style={{
                    background: "#f0f7ff",
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "12px",
                    fontSize: "0.85rem",
                    color: "#666",
                    border: `1px solid #b3d9ff`,
                  }}
                >
                  Looking for suggestions...
                </div>
              )}
              
              {!loadingSuggestions && suggestions[currentPointIndex] && !answers[currentPointIndex] && (
                <div
                  style={{
                    background: "#f0f7ff",
                    borderRadius: "8px",
                    padding: "12px",
                    marginBottom: "12px",
                    border: `1px solid #b3d9ff`,
                  }}
                >
                  <div style={{ fontSize: "0.85rem", color: "#666", marginBottom: "8px" }}>
                    <strong>Suggested answer</strong> {suggestions[currentPointIndex].timesUsed > 1 && (
                      <span style={{ color: "#999" }}> (used {suggestions[currentPointIndex].timesUsed} times)</span>
                    )}
                  </div>
                  <div
                    style={{
                      background: WHITE,
                      borderRadius: "6px",
                      padding: "10px",
                      marginBottom: "10px",
                      fontSize: "0.9rem",
                      color: MONUMENT,
                      border: `1px solid #d0e7ff`,
                    }}
                  >
                    {suggestions[currentPointIndex].answer}
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      onClick={handleAcceptSuggestion}
                      style={{
                        padding: "6px 12px",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        color: WHITE,
                        background: "#4CAF50",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      Use This
                    </button>
                    <button
                      onClick={handleUseSuggestion}
                      style={{
                        padding: "6px 12px",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        color: MONUMENT,
                        background: "#e3f2fd",
                        border: `1px solid #90caf9`,
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleIgnoreSuggestion}
                      style={{
                        padding: "6px 12px",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        color: MONUMENT,
                        background: "transparent",
                        border: `1px solid ${SECTION_GREY}`,
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              )}
              
              <textarea
                value={answers[currentPointIndex] || ""}
                onChange={(e) => handleAnswerChange(e.target.value)}
                placeholder="Type your answer here..."
                style={{
                  width: "100%",
                  minHeight: "120px",
                  padding: "12px",
                  borderRadius: "8px",
                  border: `1px solid ${SECTION_GREY}`,
                  fontSize: "0.95rem",
                  color: MONUMENT,
                  background: WHITE,
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              {currentPointIndex > 0 && (
                <button
                  onClick={handleBack}
                  style={{
                    padding: "10px 20px",
                    fontSize: "1rem",
                    fontWeight: 500,
                    color: MONUMENT,
                    background: "transparent",
                    border: `1px solid ${SECTION_GREY}`,
                    borderRadius: "8px",
                    cursor: "pointer",
                  }}
                >
                  Back
                </button>
              )}
              <button
                onClick={handleSkip}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: "transparent",
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Skip
              </button>
              <button
                onClick={handleNext}
                disabled={isCompiling}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: WHITE,
                  background: isCompiling ? SECTION_GREY : MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  cursor: isCompiling ? "not-allowed" : "pointer",
                }}
              >
                {isCompiling
                  ? "Compiling..."
                  : isLastPoint
                  ? "Finish & Generate Email"
                  : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && finalDraft && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1001,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              // Don't close on outside click
            }
          }}
        >
          <div
            style={{
              background: WHITE,
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "800px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, fontSize: "1.5rem", color: MONUMENT }}>Email Draft Review</h2>
              <button
                onClick={() => setShowReviewModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: MONUMENT,
                  padding: "0",
                  width: "30px",
                  height: "30px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.9rem",
                    color: "#32323399",
                    marginBottom: "6px",
                    fontWeight: 500,
                  }}
                >
                  Subject
                </label>
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "1rem",
                    color: MONUMENT,
                    background: "#f9f9f9",
                    minHeight: "40px",
                  }}
                >
                  {finalDraft.subject}
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.9rem",
                    color: "#32323399",
                    marginBottom: "6px",
                    fontWeight: 500,
                  }}
                >
                  Body
                </label>
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1px solid ${SECTION_GREY}`,
                    fontSize: "0.95rem",
                    color: MONUMENT,
                    background: "#f9f9f9",
                    minHeight: "200px",
                    whiteSpace: "pre-wrap",
                    lineHeight: "1.6",
                  }}
                >
                  {finalDraft.body}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "24px" }}>
              <button
                onClick={() => {
                  // Copy to clipboard
                  const emailText = `Subject: ${finalDraft.subject}\n\n${finalDraft.body}`;
                  navigator.clipboard.writeText(emailText).then(() => {
                    alert("Email draft copied to clipboard!");
                  });
                }}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: MONUMENT,
                  background: "transparent",
                  border: `1px solid ${SECTION_GREY}`,
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Copy to Clipboard
              </button>
              <button
                onClick={handleReset}
                style={{
                  padding: "10px 20px",
                  fontSize: "1rem",
                  fontWeight: 500,
                  color: WHITE,
                  background: MONUMENT,
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Start Over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
