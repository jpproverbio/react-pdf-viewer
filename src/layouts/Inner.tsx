/**
 * A React component to view a PDF document
 *
 * @see https://react-pdf-viewer.dev
 * @license https://react-pdf-viewer.dev/license
 * @copyright 2019-2020 Nguyen Huu Phuoc <me@phuoc.ng>
 */

import React from 'react';

import File from '../File';
import useDragScroll from '../hooks/useDragScroll';
import useDrop from '../hooks/useDrop';
import useFullScreen from '../hooks/useFullScreen';
import useToggle from '../hooks/useToggle';
import PageLayer from '../layers/PageLayer';
import DropArea from '../open/DropArea';
import PrintContainer from '../print/PrintContainer';
import PrintStatus from '../print/PrintStatus';
import Match from '../search/Match';
import ScrollMode from '../ScrollMode';
import SelectionMode from '../SelectionMode';
import SpecialZoomLevel from '../SpecialZoomLevel';
import ThemeContent from '../theme/ThemeContext';
import PdfJs from '../vendors/PdfJs';
import downloadFile from '../utils/downloadFile';
import getFileExt from '../utils/fileExt';
import { RenderViewer } from '../Viewer';
import ExitFullScreen from './ExitFullScreen';
import './inner.less';
import { Layout } from './Layout';
import { PageSize } from './PageSizeCalculator';
import { RenderPage } from './RenderPage';
import Sidebar from './Sidebar';
import Toolbar from './Toolbar';
import { RenderToolbarSlot } from './ToolbarSlot';

// `new RegExp('')` will treat the source as `(?:)` which is not an empty string
const EMPTY_KEYWORD_REGEXP = new RegExp(' ');
const SCROLL_BAR_WIDTH = 17;
const PAGE_PADDING = 8;

interface InnerProps {
    doc: PdfJs.PdfDocument;
    file: File;
    initialPage?: number;
    keyword?: string | RegExp;
    layout: Layout;
    pageSize: PageSize;
    render: RenderViewer;
    renderPage?: RenderPage;
    selectionMode: SelectionMode;
    onDocumentLoad(doc: PdfJs.PdfDocument): void;
    onOpenFile(fileName: string, data: Uint8Array): void;
    onZoom(doc: PdfJs.PdfDocument, scale: number): void;
}

const Inner: React.FC<InnerProps> = ({
    doc, file, initialPage, keyword, layout, pageSize, render, renderPage, selectionMode,
    onDocumentLoad, onOpenFile, onZoom,
}) => {
    const theme = React.useContext(ThemeContent);
    const pagesRef = React.useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = React.useState(pageSize.scale);
    const [currentPage, setCurrentPage] = React.useState(0);
    const [rotation, setRotation] = React.useState(0);
    const [keywordRegexp, setKeywordRegexp] = React.useState<RegExp>(
        keyword
        ? ((typeof keyword === 'string') ? new RegExp(keyword) : keyword)
        : EMPTY_KEYWORD_REGEXP
    );
    const [match, setMatch] = React.useState<Match>({
        matchIndex: -1,
        pageIndex: -1,
    });
    const [scrollMode, setScrollMode] = React.useState<ScrollMode>(ScrollMode.Vertical);
    const [currentMode, setCurrentMode] = React.useState<SelectionMode>(selectionMode);
    const { toggleDragScroll } = useDragScroll(pagesRef);
    const { isFullScreen, openFullScreen, closeFullScreen } = useFullScreen(pagesRef);
    const toggleSidebar = useToggle();

    const { numPages } = doc;
    const { pageWidth, pageHeight } = pageSize;

    const arr = Array(numPages).fill(null);
    const pageVisibility = arr.map(() => 0);
    const pageRefs = arr.map(() => React.useRef<HTMLDivElement>());

    const openFiles = (files: FileList): void => {
        if (files.length === 0) {
            return;
        }
        const selectedFile = files[0];
        if (getFileExt(file.name).toLowerCase() !== 'pdf') {
            return;
        }
        new Promise<Uint8Array>((resolve) => {
            const reader = new FileReader();
            reader.readAsArrayBuffer(selectedFile);
            reader.onload = (): void => {
                const bytes = new Uint8Array(reader.result as ArrayBuffer);
                resolve(bytes);
            };
        }).then((data) => {
            onOpenFile(selectedFile.name, data);
        });
    };
    const { isDragging } = useDrop(pagesRef, (files) => openFiles(files));

    // Print status
    const [printStatus, setPrintStatus] = React.useState(PrintStatus.Inactive);

    const jumpToPage = (pageIndex: number): void => {
        if (pageIndex < 0 || pageIndex >= numPages) {
            return;
        }
        setCurrentPage(pageIndex);
        const pagesContainer = pagesRef.current;
        const targetPage = pageRefs[pageIndex].current;
        if (pagesContainer && targetPage) {
            pagesContainer.scrollTop = targetPage.offsetTop;
        }
    };

    React.useEffect(() => {
        onDocumentLoad(doc);
        if (initialPage) {
            jumpToPage(initialPage);
        }
    }, []);

    // Manage the selection mode
    const changeSelectionMode = (mode: SelectionMode): void => {
        toggleDragScroll(mode === SelectionMode.Hand);
        setCurrentMode(mode);
    };
    React.useEffect(() => {
        // Toggle the drag scroll if the hand tool is set initially
        if (selectionMode === SelectionMode.Hand) {
            toggleDragScroll(true);
        }
    }, []);

    const download = (): void => {
        downloadFile(file.name, file.data);
    };

    const zoom = (newScale: number | SpecialZoomLevel): void => {
        const pagesEle = pagesRef.current;
        if (!pagesEle) {
            return;
        }

        let scaled = 1;
        switch (newScale) {
            case SpecialZoomLevel.ActualSize:
                scaled = 1;
                break;

            case SpecialZoomLevel.PageFit:
                scaled = Math.min(
                    (pagesEle.offsetWidth - SCROLL_BAR_WIDTH) / pageWidth,
                    (pagesEle.offsetHeight - 2 * PAGE_PADDING) / pageHeight
                );
                break;

            case SpecialZoomLevel.PageWidth:
                scaled = (pagesEle.offsetWidth - SCROLL_BAR_WIDTH) / pageWidth;
                break;

            default:
                scaled = newScale;
                break;
        }
        setScale(scaled);
        onZoom(doc, scaled);
    };

    const pageVisibilityChanged = (pageIndex: number, ratio: number): void => {
        pageVisibility[pageIndex] = ratio;
        const maxRatioPage = pageVisibility.reduce((maxIndex, item, index, array) => {
            return item > array[maxIndex] ? index : maxIndex;
        }, 0);
        setCurrentPage(maxRatioPage);
    };

    const rotate = (degree: number): void => {
        const updateRotation = (rotation === 360 || rotation === -360) ? degree : rotation + degree;
        setRotation(updateRotation);
    };

    const changeScrollMode = (mode: ScrollMode): void => {
        const pagesContainer = pagesRef.current;
        if (!pagesContainer) {
            return;
        }
        switch (mode) {
            case ScrollMode.Vertical:
                pagesContainer.classList.add(`${theme.prefixClass}-inner-pages-vertical`);
                pagesContainer.classList.remove(`${theme.prefixClass}-inner-pages-horizontal`);
                pagesContainer.classList.remove(`${theme.prefixClass}-inner-pages-wrapped`);
                break;

            case ScrollMode.Horizontal:
                pagesContainer.classList.add(`${theme.prefixClass}-inner-pages-horizontal`);
                pagesContainer.classList.remove(`${theme.prefixClass}-inner-pages-vertical`);
                pagesContainer.classList.remove(`${theme.prefixClass}-inner-pages-wrapped`);
                break;

            case ScrollMode.Wrapped:
                pagesContainer.classList.add(`${theme.prefixClass}-inner-pages-wrapped`);
                pagesContainer.classList.remove(`${theme.prefixClass}-inner-pages-vertical`);
                pagesContainer.classList.remove(`${theme.prefixClass}-inner-pages-horizontal`);
                break;

            default:
                break;
        }
        setScrollMode(mode);
    };

    const jumpToMatch = (target: Match): void => {
        jumpToPage(target.pageIndex);
        setMatch(target);
    };

    const jumpToDest = (pageIndex: number, bottomOffset: number, scaleTo: number | SpecialZoomLevel): void => {
        const pagesContainer = pagesRef.current;
        if (!pagesContainer) {
            return;
        }

        const newPageIndex = pageIndex + 1;
        doc.getPage(newPageIndex).then((page) => {
            const viewport = page.getViewport({ scale: 1 });

            let top = 0;
            const bottom = bottomOffset || 0;
            switch (scaleTo) {
                case SpecialZoomLevel.PageFit:
                    top = 0;
                    zoom(SpecialZoomLevel.PageFit);
                    break;
                default:
                    top = (viewport.height - bottom) * scale;
                    break;
            }

            const targetPageEle = pageRefs[pageIndex].current;
            if (targetPageEle) {
                pagesContainer.scrollTop = targetPageEle.offsetTop + top;
            }
        });
    };

    // Switch to the print mode
    const print = (): void => setPrintStatus(PrintStatus.Preparing);
    const cancelPrinting = (): void => setPrintStatus(PrintStatus.Inactive);
    const startPrinting = (): void => setPrintStatus(PrintStatus.Ready);

    return render({
        viewer: layout(
            toggleSidebar.opened,
            {
                attrs: {
                    style: {
                        position: 'relative',
                    }
                },
                children: (
                    <PrintContainer
                        doc={doc}
                        pageHeight={pageHeight}
                        pageWidth={pageWidth}
                        printStatus={printStatus}
                        rotation={rotation}
                        onCancel={cancelPrinting}
                        onStartPrinting={startPrinting}
                    />
                )
            },
            {
                attrs: {
                    ref: pagesRef,
                    style: {
                        position: 'relative',
                    },
                },
                children: (
                    <>
                    {isDragging && <DropArea />}
                    {isFullScreen && <ExitFullScreen onClick={closeFullScreen} />}
                    {
                        Array(numPages).fill(0).map((_, index) => {
                            return (
                                <div
                                    className={`${theme.prefixClass}-inner-page`}
                                    key={`pagelayer-${index}`}
                                    ref={(ref): void => {
                                        pageRefs[index].current = ref as HTMLDivElement;
                                    }}
                                >
                                    <PageLayer
                                        doc={doc}
                                        keywordRegexp={keywordRegexp}
                                        height={pageHeight}
                                        match={match}
                                        pageIndex={index}
                                        renderPage={renderPage}
                                        rotation={rotation}
                                        scale={scale}
                                        width={pageWidth}
                                        onJumpToDest={jumpToDest}
                                        onPageVisibilityChanged={pageVisibilityChanged}
                                    />
                                </div>
                            );
                        })
                    }
                    </>
                ),
            },
            (renderToolbar: RenderToolbarSlot) => (
                <Toolbar
                    currentPage={currentPage}
                    doc={doc}
                    fileName={file.name}
                    scale={scale}
                    scrollMode={scrollMode}
                    selectionMode={currentMode}
                    onChangeScrollMode={changeScrollMode}
                    onChangeSelectionMode={changeSelectionMode}
                    onDownload={download}
                    onFullScreen={openFullScreen}
                    onJumpTo={jumpToPage}
                    onJumpToMatch={jumpToMatch}
                    onOpenFiles={openFiles}
                    onPrint={print}
                    onRotate={rotate}
                    onSearchFor={setKeywordRegexp}
                    onToggleSidebar={toggleSidebar.toggle}
                    onZoom={zoom}
                    renderToolbar={renderToolbar}
                />
            ),
            {
                attrs: {},
                children: (
                    <Sidebar
                        currentPage={currentPage}
                        doc={doc}
                        height={pageHeight}
                        rotation={rotation}
                        width={pageWidth}
                        onJumpToDest={jumpToDest}
                        onJumpToPage={jumpToPage}
                    />
                ),
            },
        ),
        doc,
        download,
        changeScrollMode,
        changeSelectionMode,
        jumpToPage,
        print,
        rotate,
        zoom,
    });
};

export default Inner;
