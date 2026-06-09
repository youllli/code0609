let faceMesh;
let video;
let faces = [];

const canvasW = 960;
const canvasH = 720;
const mouthOpenThreshold = 0.18;
const answerArmDelay = 1000;
const answerHoldTime = 650;
const correctEffectTime = 3000;

let questionIndex = 0;
let score = 0;
let gameState = "loading";
let stateStartedAt = 0;
let stableMouthState = null;
let stableStartedAt = 0;
let feedbackText = "";
let effectParticles = [];

const questions = [
  { text: "台灣的首都是台北市。", answer: true },
  { text: "玉山是台灣最高的山。", answer: true },
  { text: "日月潭位在花蓮縣。", answer: false },
  { text: "台灣的國花是梅花。", answer: true },
  { text: "高雄港是台灣重要的國際商港。", answer: true },
  { text: "阿里山以森林鐵路和日出聞名。", answer: true },
  { text: "澎湖位於台灣本島東方。", answer: false },
  { text: "台灣高鐵目前行駛於西部走廊。", answer: true },
  { text: "淡水河流經台北盆地。", answer: true },
  { text: "墾丁國家公園位於台灣北部。", answer: false }
];

const faceConnections = [
  [10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389],
  [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397],
  [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152],
  [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172],
  [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162],
  [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10],
  [33, 160], [160, 158], [158, 133], [133, 153], [153, 144], [144, 33],
  [263, 387], [387, 385], [385, 362], [362, 380], [380, 373], [373, 263],
  [61, 185], [185, 40], [40, 39], [39, 37], [37, 0], [0, 267],
  [267, 269], [269, 270], [270, 409], [409, 291], [291, 375], [375, 321],
  [321, 405], [405, 314], [314, 17], [17, 84], [84, 181], [181, 91],
  [91, 146], [146, 61]
];

function preload() {
  faceMesh = ml5.faceMesh({
    maxFaces: 1,
    refineLandmarks: false,
    flipHorizontal: false
  });
}

function setup() {
  const canvas = createCanvas(canvasW, canvasH);
  canvas.parent("canvas-holder");
  textFont("Noto Sans TC, Microsoft JhengHei, Arial");

  video = createCapture(VIDEO, () => {
    gameState = "answering";
    stateStartedAt = millis();
  });
  video.size(canvasW, canvasH);
  video.hide();

  faceMesh.detectStart(video, gotFaces);
}

function draw() {
  drawCameraBackground();
  drawFaceMesh();

  const mouth = getMouthState();
  updateAnswerState(mouth);
  updateEffects();

  drawOverlay(mouth);
}

function gotFaces(results) {
  faces = results;
}

function drawCameraBackground() {
  push();
  translate(width, 0);
  scale(-1, 1);
  image(video, 0, 0, width, height);
  pop();

  noStroke();
  fill(0, 115);
  rect(0, 0, width, height);
}

function drawFaceMesh() {
  if (faces.length === 0) return;

  const points = faces[0].keypoints;
  stroke(49, 214, 177, 170);
  strokeWeight(2);
  for (const [a, b] of faceConnections) {
    const pa = mirroredPoint(points[a]);
    const pb = mirroredPoint(points[b]);
    if (pa && pb) line(pa.x, pa.y, pb.x, pb.y);
  }

  noStroke();
  fill(255, 238, 99);
  for (const point of points) {
    const p = mirroredPoint(point);
    circle(p.x, p.y, 3.4);
  }

  const lipIds = [0, 13, 14, 17, 37, 39, 40, 61, 84, 91, 146, 181, 185, 267, 269, 270, 291, 314, 321, 375, 405, 409];
  fill(255, 99, 132);
  for (const id of lipIds) {
    const p = mirroredPoint(points[id]);
    if (p) circle(p.x, p.y, 7);
  }
}

function getMouthState() {
  if (faces.length === 0) {
    return { ready: false, open: false, ratio: 0 };
  }

  const points = faces[0].keypoints;
  const upper = points[13];
  const lower = points[14];
  const left = points[61];
  const right = points[291];
  if (!upper || !lower || !left || !right) {
    return { ready: false, open: false, ratio: 0 };
  }

  const vertical = dist(upper.x, upper.y, lower.x, lower.y);
  const horizontal = dist(left.x, left.y, right.x, right.y);
  const ratio = horizontal > 0 ? vertical / horizontal : 0;
  return {
    ready: true,
    open: ratio > mouthOpenThreshold,
    ratio
  };
}

function updateAnswerState(mouth) {
  if (gameState !== "answering" || !mouth.ready) return;
  if (millis() - stateStartedAt < answerArmDelay) return;

  if (stableMouthState !== mouth.open) {
    stableMouthState = mouth.open;
    stableStartedAt = millis();
    return;
  }

  if (millis() - stableStartedAt >= answerHoldTime) {
    submitAnswer(mouth.open);
  }
}

function submitAnswer(isYes) {
  const isCorrect = isYes === questions[questionIndex].answer;
  stableMouthState = null;
  stableStartedAt = millis();

  if (!isCorrect) {
    feedbackText = isYes ? "答錯了，再試一次：閉嘴是 NO" : "答錯了，再試一次：張嘴是 YES";
    stateStartedAt = millis();
    return;
  }

  score += 1;
  feedbackText = "答對了！";
  gameState = "correct";
  stateStartedAt = millis();
  burstEffects();
}

function updateEffects() {
  for (let i = effectParticles.length - 1; i >= 0; i -= 1) {
    const p = effectParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.04;
    p.life -= 1;
    if (p.life <= 0) effectParticles.splice(i, 1);
  }

  if (gameState === "correct" && millis() - stateStartedAt >= correctEffectTime) {
    questionIndex += 1;
    if (questionIndex >= questions.length) {
      gameState = "finished";
      feedbackText = "遊戲完成！";
    } else {
      gameState = "answering";
      feedbackText = "";
      stateStartedAt = millis();
    }
  }
}

function burstEffects() {
  effectParticles = [];
  for (let i = 0; i < 110; i += 1) {
    const angle = random(TWO_PI);
    const speed = random(2.5, 9);
    effectParticles.push({
      x: width / 2,
      y: height / 2,
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      size: random(5, 13),
      hue: random([49, 99, 132, 214, 255]),
      life: random(55, 95)
    });
  }
}

function drawOverlay(mouth) {
  drawParticles();
  drawTopBar(mouth);

  if (gameState === "loading") {
    drawPanel("正在啟用 webcam 與 FaceMesh", "請允許瀏覽器使用攝影機");
    return;
  }

  if (gameState === "finished") {
    drawPanel("完成！", `你答對 ${score} / ${questions.length} 題`);
    return;
  }

  const q = questions[questionIndex];
  const answerHint = mouth.open ? "目前偵測：張嘴 YES" : "目前偵測：閉嘴 NO";
  const prompt = gameState === "correct" ? "3 秒後進入下一題" : "請作答";

  drawQuestionCard(q.text, prompt, answerHint);
}

function drawTopBar(mouth) {
  const margin = 24;
  const barH = 58;

  noStroke();
  fill(8, 8, 8, 180);
  rect(margin, margin, width - margin * 2, barH, 8);

  fill(255);
  textSize(22);
  textAlign(LEFT, CENTER);
  text(`第 ${min(questionIndex + 1, questions.length)} / ${questions.length} 題`, margin + 20, margin + barH / 2);

  textAlign(RIGHT, CENTER);
  text(`分數 ${score}`, width - margin - 20, margin + barH / 2);

  const meterW = 190;
  const meterX = width - margin - 20 - meterW - 104;
  const meterY = margin + 18;
  fill(255, 255, 255, 45);
  rect(meterX, meterY, meterW, 22, 6);
  fill(mouth.open ? "#31d6b1" : "#ffdd55");
  rect(meterX, meterY, constrain(mouth.ratio / 0.34, 0, 1) * meterW, 22, 6);
}

function drawQuestionCard(questionText, prompt, answerHint) {
  const cardX = 60;
  const cardY = height - 258;
  const cardW = width - 120;
  const cardH = 210;

  noStroke();
  fill(10, 10, 10, 195);
  rect(cardX, cardY, cardW, cardH, 8);

  fill("#31d6b1");
  textAlign(CENTER, CENTER);
  textSize(36);
  text(prompt, width / 2, cardY + 42);

  fill(255);
  textSize(34);
  textWrap(WORD);
  text(questionText, cardX + 38, cardY + 78, cardW - 76, 70);

  fill(255, 229, 118);
  textSize(22);
  text(answerHint, width / 2, cardY + 160);

  if (feedbackText) {
    fill(gameState === "correct" ? "#31d6b1" : "#ff6b6b");
    textSize(24);
    text(feedbackText, width / 2, cardY + 190);
  }
}

function drawPanel(title, subtitle) {
  noStroke();
  fill(10, 10, 10, 205);
  rect(120, height / 2 - 105, width - 240, 210, 8);

  textAlign(CENTER, CENTER);
  fill("#31d6b1");
  textSize(42);
  text(title, width / 2, height / 2 - 28);
  fill(255);
  textSize(26);
  text(subtitle, width / 2, height / 2 + 38);
}

function drawParticles() {
  noStroke();
  for (const p of effectParticles) {
    fill(p.hue, 220, 190, map(p.life, 0, 95, 0, 255));
    circle(p.x, p.y, p.size);
  }

  if (gameState === "correct") {
    textAlign(CENTER, CENTER);
    fill(255, 245, 150);
    textSize(76);
    text("答對了！", width / 2, height / 2 - 24);
  }
}

function mirroredPoint(point) {
  if (!point) return null;
  return {
    x: width - point.x,
    y: point.y
  };
}
