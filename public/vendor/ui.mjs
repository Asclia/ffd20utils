// Single entry point for the UI libraries (vendored, no build step needed).
import { h, render, Fragment, createContext, Component } from './preact.mjs';
import { useState, useEffect, useMemo, useRef, useCallback, useContext, useReducer } from './hooks.mjs';
import htm from './htm.mjs';
export const html = htm.bind(h);
export { h, render, Fragment, createContext, Component, useState, useEffect, useMemo, useRef, useCallback, useContext, useReducer };
