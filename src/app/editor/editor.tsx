"use client";

/* --------------------------------------------------------------------------------------------
 * Copyright (c) 2024 TypeFox and others.
 * Licensed under the MIT License. See LICENSE in the package root for license information.
* ------------------------------------------------------------------------------------------ */
import { useCallback, useMemo } from 'react'
import * as vscode from 'vscode';
import { type RegisterLocalProcessExtensionResult } from '@codingame/monaco-vscode-api/extensions';
import React from 'react';
//import ReactDOM from 'react-dom/client';
import { MonacoEditorReactComp } from '@typefox/monaco-editor-react';
import { MonacoEditorLanguageClientWrapper } from 'monaco-editor-wrapper';
import { createWrapperConfig  } from './config';
//import { configureDebugging } from '../../debugger/client/debugger.js';




// export const runPythonReact = async () => {





// };
export const Editor = () => {

    const appConfig = useMemo(() => createWrapperConfig(), [])

    const onLoad = useCallback(async (wrapper: MonacoEditorLanguageClientWrapper) => {

        //          async (wrapper: MonacoEditorLanguageClientWrapper) => {
        const result = wrapper.getExtensionRegisterResult('mlc-python-example') as RegisterLocalProcessExtensionResult;
        result.setAsDefaultApi();

        const initResult = wrapper.getExtensionRegisterResult('debugger-py-client') as RegisterLocalProcessExtensionResult | undefined;
        if (initResult !== undefined) {
            //            configureDebugging(await initResult.getApi(), appConfig.configParams);
        }

        await vscode.commands.executeCommand('workbench.view.explorer');
        await vscode.window.showTextDocument(appConfig.configParams.files.get('hello2.py')!.uri);
    }, []);

    return (
        <div style={{ 'backgroundColor': '#1f1f1f' }} >
            <MonacoEditorReactComp
                wrapperConfig={appConfig.wrapperConfig}
                style={{ 'height': '100%' }}
                onLoad={onLoad}
                onError={(e) => {
                    console.error(e);
                }} />
        </div>
    );
};
