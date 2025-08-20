class ClockApp {
    constructor() {
        this.currentTimezone = 'local';
        this.stopwatchInterval = null;
        this.stopwatchTime = 0;
        this.timerInterval = null;
        this.timerTime = 0;
        // Use shared workspace theme setting
        const savedTheme = localStorage.getItem('workspace-theme');
        this.isDarkMode = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
        
        this.init();
    }

    init() {
        this.initTheme();
        this.initClock();
        this.initAnalogClock();
        this.initTimezoneSelector();
        this.initStopwatch();
        this.initTimer();
        this.initWorldClocks();
        
        setInterval(() => this.updateClock(), 1000);
    }

    initTheme() {
        const themeToggle = document.getElementById('themeToggle');
        
        if (this.isDarkMode) {
            document.body.classList.add('dark-mode');
            themeToggle.querySelector('.theme-icon').textContent = '☀️';
        }
        
        themeToggle.addEventListener('click', () => {
            this.isDarkMode = !this.isDarkMode;
            document.body.classList.toggle('dark-mode');
            themeToggle.querySelector('.theme-icon').textContent = this.isDarkMode ? '☀️' : '🌙';
            localStorage.setItem('workspace-theme', this.isDarkMode ? 'dark' : 'light');
        });
    }

    initClock() {
        this.updateClock();
    }

    updateClock() {
        const now = this.getCurrentTime();
        
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        document.getElementById('digitalTime').textContent = `${hours}:${minutes}:${seconds}`;
        
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            timeZoneName: 'short'
        };
        
        if (this.currentTimezone !== 'local') {
            options.timeZone = this.currentTimezone;
        }
        
        document.getElementById('digitalDate').textContent = now.toLocaleDateString('en-US', options);
        
        this.updateAnalogClock(now);
        this.updateWorldClocks();
    }

    getCurrentTime() {
        if (this.currentTimezone === 'local') {
            return new Date();
        }
        
        const now = new Date();
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        
        const timezoneOffsets = {
            'UTC': 0,
            'America/New_York': -5,
            'Europe/London': 0,
            'Asia/Tokyo': 9,
            'Australia/Sydney': 11
        };
        
        const offset = timezoneOffsets[this.currentTimezone] || 0;
        return new Date(utcTime + (3600000 * offset));
    }

    initAnalogClock() {
        const clockNumbers = document.getElementById('clockNumbers');
        
        for (let i = 1; i <= 12; i++) {
            const angle = (i - 3) * 30;
            const x = 100 + 80 * Math.cos(angle * Math.PI / 180);
            const y = 100 + 80 * Math.sin(angle * Math.PI / 180);
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y + 5);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('class', 'clock-number');
            text.textContent = i;
            clockNumbers.appendChild(text);
        }
    }

    updateAnalogClock(now) {
        const hours = now.getHours() % 12;
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        
        // Calculate angles with no offset
        const hourAngle = (hours * 30) + (minutes * 0.5);
        const minuteAngle = (minutes * 6) + (seconds * 0.1);
        const secondAngle = seconds * 6;
        
        // Apply rotation using setAttribute with explicit center point
        document.getElementById('hourHand').setAttribute('transform', `rotate(${hourAngle} 100 100)`);
        document.getElementById('minuteHand').setAttribute('transform', `rotate(${minuteAngle} 100 100)`);
        document.getElementById('secondHand').setAttribute('transform', `rotate(${secondAngle} 100 100)`);
    }

    initTimezoneSelector() {
        const timezoneSelector = document.getElementById('timezone');
        timezoneSelector.addEventListener('change', (e) => {
            this.currentTimezone = e.target.value;
            this.updateClock();
        });
    }

    initStopwatch() {
        const startBtn = document.getElementById('startStopwatch');
        const resetBtn = document.getElementById('resetStopwatch');
        
        startBtn.addEventListener('click', () => {
            if (this.stopwatchInterval) {
                clearInterval(this.stopwatchInterval);
                this.stopwatchInterval = null;
                startBtn.textContent = 'Start';
            } else {
                this.stopwatchInterval = setInterval(() => {
                    this.stopwatchTime++;
                    this.updateStopwatchDisplay();
                }, 10);
                startBtn.textContent = 'Stop';
            }
        });
        
        resetBtn.addEventListener('click', () => {
            clearInterval(this.stopwatchInterval);
            this.stopwatchInterval = null;
            this.stopwatchTime = 0;
            this.updateStopwatchDisplay();
            startBtn.textContent = 'Start';
        });
    }

    updateStopwatchDisplay() {
        const totalSeconds = Math.floor(this.stopwatchTime / 100);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const centiseconds = this.stopwatchTime % 100;
        
        const display = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
        document.getElementById('stopwatchDisplay').textContent = display;
    }

    initTimer() {
        const startBtn = document.getElementById('startTimer');
        const resetBtn = document.getElementById('resetTimer');
        const minutesInput = document.getElementById('timerMinutes');
        const secondsInput = document.getElementById('timerSeconds');
        
        const updateTimerDisplay = () => {
            const minutes = parseInt(minutesInput.value) || 0;
            const seconds = parseInt(secondsInput.value) || 0;
            this.timerTime = minutes * 60 + seconds;
            this.updateTimerDisplay();
        };
        
        minutesInput.addEventListener('input', updateTimerDisplay);
        secondsInput.addEventListener('input', updateTimerDisplay);
        
        startBtn.addEventListener('click', () => {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
                startBtn.textContent = 'Start';
            } else if (this.timerTime > 0) {
                this.timerInterval = setInterval(() => {
                    this.timerTime--;
                    this.updateTimerDisplay();
                    
                    if (this.timerTime <= 0) {
                        clearInterval(this.timerInterval);
                        this.timerInterval = null;
                        startBtn.textContent = 'Start';
                        this.playTimerAlert();
                    }
                }, 1000);
                startBtn.textContent = 'Pause';
            }
        });
        
        resetBtn.addEventListener('click', () => {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
            updateTimerDisplay();
            startBtn.textContent = 'Start';
        });
        
        updateTimerDisplay();
    }

    updateTimerDisplay() {
        const minutes = Math.floor(this.timerTime / 60);
        const seconds = this.timerTime % 60;
        const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        document.getElementById('timerDisplay').textContent = display;
    }

    playTimerAlert() {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 440;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 1);
    }

    initWorldClocks() {
        const worldClocksContainer = document.getElementById('worldClocks');
        const cities = [
            { name: 'New York', timezone: 'America/New_York' },
            { name: 'London', timezone: 'Europe/London' },
            { name: 'Tokyo', timezone: 'Asia/Tokyo' },
            { name: 'Sydney', timezone: 'Australia/Sydney' }
        ];
        
        cities.forEach(city => {
            const clockDiv = document.createElement('div');
            clockDiv.className = 'world-clock-item';
            clockDiv.innerHTML = `
                <span class="city-name">${city.name}</span>
                <span class="city-time" data-timezone="${city.timezone}">--:--:--</span>
            `;
            worldClocksContainer.appendChild(clockDiv);
        });
        
        this.updateWorldClocks();
    }

    updateWorldClocks() {
        const worldClockItems = document.querySelectorAll('.city-time');
        worldClockItems.forEach(item => {
            const timezone = item.dataset.timezone;
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', { 
                timeZone: timezone,
                hour12: false 
            });
            item.textContent = timeString;
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ClockApp();
});