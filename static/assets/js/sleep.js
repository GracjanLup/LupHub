function initSleepModeToggle() {
	const buttons = document.querySelectorAll('.sleep-mode-button');
	const talkSection = document.getElementById('sleep-mode-talk');
	const courseSection = document.getElementById('sleep-mode-course');

	if (!buttons.length || !talkSection || !courseSection) {
		return;
	}

	buttons.forEach((button) => {
		button.addEventListener('click', () => {
			const mode = button.dataset.mode;
			buttons.forEach((btn) => btn.classList.toggle('active', btn === button));
			talkSection.classList.toggle('active', mode === 'talk');
			courseSection.classList.toggle('active', mode === 'course');
		});
	});
}

function initSleepCoursePreview() {
	const buttonsContainer = document.getElementById('sleep-day-buttons');
	const headingEl = document.getElementById('sleep-day-heading');
	const questionsEl = document.getElementById('sleep-question-list');
	const lessonContainer = document.getElementById('sleep-lesson-box');
	const lessonEl = document.getElementById('sleep-lesson-text') || document.createElement('p');
	const statusEl = document.getElementById('sleep-status-text');
	const generateBtn = document.getElementById('sleep-generate-button');

	if (!buttonsContainer || !headingEl || !questionsEl || !lessonContainer || !statusEl || !generateBtn) {
		return;
	}
	if (!lessonEl.parentElement) {
		lessonContainer.appendChild(lessonEl);
		lessonEl.id = 'sleep-lesson-text';
	}

	const sleepProtocol = [
		{
			id: 'day1',
			label: 'Day 1',
			title: 'Day 1 — Baseline habits',
			lesson: 'Focus on understanding your current sleep duration and how consistently you follow a routine. The real AI lesson will summarize your answers here later.',
			questions: [
				'How many hours do you usually sleep?',
				'Do you have stable sleep routine hours?',
				'How many days in a week on average do you stick to your sleep routine?'
			]
		},
		{
			id: 'day2',
			label: 'Day 2',
			title: 'Day 2 — Evening nutrition & substances',
			lesson: 'Upcoming integration will look at how food and caffeine timing influence your next-day plan.',
			questions: [
				'Did you apply yesterday’s advice?',
				'Do you usually eat 5 hours before sleep or less? If yes, what do you eat?',
				'Do you usually consume caffeine 10 hours before sleep or less? If yes, what and how much?'
			]
		},
		{
			id: 'day3',
			label: 'Day 3',
			title: 'Day 3 — Late workouts',
			lesson: 'Placeholder: future AI lessons will tailor wind-down training tips based on your routine.',
			questions: [
				'Did you apply yesterday’s advice?',
				'Do you usually train 6 hours or less before bedtime?',
				'What kind of training do you usually do in the evening? If none, choose “Skip”.'
			]
		},
		{
			id: 'day4',
			label: 'Day 4',
			title: 'Day 4 — Wind-down routines',
			lesson: 'Placeholder: expect calming techniques and suggestions for pre-sleep rituals.',
			questions: [
				'Did you apply yesterday’s advice?',
				'Do you have a wind-down routine 1–2 hours before bedtime?',
				'What do you usually do before bedtime?'
			]
		},
		{
			id: 'day5',
			label: 'Day 5',
			title: 'Day 5 — Morning activation',
			lesson: 'Placeholder: AI will later encourage energizing morning anchors.',
			questions: [
				'Did you apply yesterday’s advice?',
				'Do you usually start your day with energetic activities?',
				'What do you usually do after wake up?'
			]
		},
		{
			id: 'day6',
			label: 'Day 6',
			title: 'Day 6 — Bedroom environment & light',
			lesson: 'Placeholder: future model output will reinforce environmental hygiene and blue light limits.',
			questions: [
				'Did you apply yesterday’s advice?',
				'Do you take care of your temperature, silence, and darkness while and before sleep? If yes, how?',
				'Do you avoid blue light before sleep? If yes, how?'
			]
		},
		{
			id: 'day7',
			label: 'Day 7',
			title: 'Day 7 — Bedroom boundaries & priorities',
			lesson: 'Placeholder: this lesson will highlight bedroom associations and personal motivation.',
			questions: [
				'Did you apply yesterday’s advice?',
				'Do you use your bed only to sleep or sexual activities? If no, what else do you do in your bed during the day?',
				'How important is sleep for you?'
			]
		},
		{
			id: 'final',
			label: 'Final',
			title: 'Final day — Diagnosis & questionnaire',
			lesson: 'Placeholder: the AI summary and recommendation set will live here, followed by the satisfaction questionnaire.',
			questions: [
				'Plan: AI-generated sleep diagnosis recapping your 7-day inputs.',
				'Questionnaire (1–5): usefulness, interest, tone, diagnosis quality, current improvement, expected improvement.'
			]
		}
	];

	let activeIndex = 0;
	const dayResponses = {};

	function setStatus(message) {
		statusEl.textContent = message;
	}

	const buttons = sleepProtocol.map((entry, index) => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'sleep-day-button';
		btn.textContent = entry.label;
		btn.addEventListener('click', () => renderDay(index));
		buttonsContainer.appendChild(btn);
		return btn;
	});

	function renderDay(index) {
		activeIndex = index;
		buttons.forEach((btn, idx) => {
			btn.classList.toggle('active', idx === activeIndex);
		});
		const entry = sleepProtocol[activeIndex];
		if (!lessonContainer.contains(lessonEl)) {
			lessonContainer.appendChild(lessonEl);
		}
		const responses = dayResponses[entry.id] || [];
		headingEl.textContent = entry.title;
		questionsEl.innerHTML = '';
		entry.questions.forEach((question, questionIndex) => {
			const wrapper = document.createElement('div');
			wrapper.className = 'sleep-question-item';
			const label = document.createElement('label');
			label.textContent = `${questionIndex + 1}. ${question}`;
			const textarea = document.createElement('textarea');
			textarea.placeholder = 'Type your short answer here (English only for Alpha).';
			textarea.value = responses[questionIndex] || '';
			textarea.addEventListener('input', (event) => {
				if (!dayResponses[entry.id]) {
					dayResponses[entry.id] = [];
				}
				dayResponses[entry.id][questionIndex] = event.target.value;
				setStatus('Inputs updated. Ready to generate a lesson.');
			});
			wrapper.appendChild(label);
			wrapper.appendChild(textarea);
			questionsEl.appendChild(wrapper);
		});
		lessonEl.textContent = '';
	}

	async function handleGenerateLesson() {
		const entry = sleepProtocol[activeIndex];
		const answers = (dayResponses[entry.id] || []).map((answer) => answer?.trim() ?? '');

		setStatus('Contacting AI model…');
		generateBtn.disabled = true;
		const originalLabel = generateBtn.textContent;
		generateBtn.textContent = 'Generating…';

		try {
			const response = await fetch('/sleep/lesson', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					day: entry.label,
					day_id: entry.id,
					title: entry.title,
					questions: entry.questions,
					answers,
					language: 'en'
				})
			});

			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload?.detail || 'Failed to fetch lesson');
			}

			lessonEl.textContent = payload.lesson || payload.response || 'Model returned an empty lesson.';
			setStatus('Lesson generated successfully.');
		} catch (error) {
			console.error('Sleep lesson error', error);
			lessonEl.textContent = 'Error generating lesson. Please try again once the model is available.';
			setStatus(error.message || 'Unexpected error.');
		} finally {
			generateBtn.disabled = false;
			generateBtn.textContent = originalLabel;
		}
	}

	renderDay(activeIndex);
	setStatus('Enter your answers and click "Generate AI lesson".');
	generateBtn.addEventListener('click', handleGenerateLesson);
}
document.addEventListener('DOMContentLoaded', () => {
	initSleepModeToggle();
	initSleepCoursePreview();
});
