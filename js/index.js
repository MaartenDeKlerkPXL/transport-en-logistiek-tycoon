// Vrachtbaas — startpunt (ES-module voor Vite)
import '../css/style.css';
import * as logic from './logic.js';
import { start } from './ui.js';

// handig in de console en voor de browsertest: VB.S is de spelstatus
window.VB = { logic, get S() { return logic.S; } };

start();
