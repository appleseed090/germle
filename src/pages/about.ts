import '../styles/main.css';
import { requireElement } from '../ui/dom';
import { connectHeaderMenu } from '../ui/header-menu';

connectHeaderMenu(
  requireElement('open-menu', HTMLButtonElement),
  requireElement('game-menu', HTMLDialogElement),
);
