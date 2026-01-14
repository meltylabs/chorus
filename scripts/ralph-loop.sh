#!/bin/bash

# Ralph Wiggum Implementation Loop
# Iteratively implements specs until all acceptance criteria pass

set -e

SPECS_DIR=".specify/specs"
MEMORY_DIR=".specify/memory"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -s, --spec NAME     Run specific spec (e.g., 001-skill-types)"
    echo "  -a, --all           Run all specs sequentially"
    echo "  -l, --list          List all available specs"
    echo "  -f, --full-auto     Skip user confirmations"
    echo "  -q, --quiet         Minimal output"
    echo ""
    echo "Examples:"
    echo "  $0 --spec 001-skill-types-and-interfaces"
    echo "  $0 --all"
    echo "  $0 --all --full-auto"
}

list_specs() {
    echo "Available specs:"
    echo ""
    for spec in "$SPECS_DIR"/*.md; do
        if [ -f "$spec" ]; then
            basename "$spec" .md
        fi
    done
}

run_spec() {
    local spec_name=$1
    local spec_file="$SPECS_DIR/$spec_name.md"

    if [ ! -f "$spec_file" ]; then
        echo -e "${RED}Error: Spec file not found: $spec_file${NC}"
        exit 1
    fi

    echo -e "${GREEN}Running spec: $spec_name${NC}"
    echo "---"
    cat "$spec_file"
    echo "---"
    echo ""
    echo "Please implement this spec using your AI coding assistant."
    echo "When complete, the agent should output: <promise>DONE</promise>"
}

run_all_specs() {
    local full_auto=$1

    for spec in "$SPECS_DIR"/*.md; do
        if [ -f "$spec" ]; then
            spec_name=$(basename "$spec" .md)

            # Skip the implementation order doc
            if [ "$spec_name" = "000-implementation-order" ]; then
                continue
            fi

            echo -e "${YELLOW}=== Processing: $spec_name ===${NC}"

            if [ "$full_auto" != "true" ]; then
                echo "Press Enter to continue with this spec, or 's' to skip..."
                read -r input
                if [ "$input" = "s" ]; then
                    echo "Skipping $spec_name"
                    continue
                fi
            fi

            run_spec "$spec_name"

            if [ "$full_auto" != "true" ]; then
                echo ""
                echo "Press Enter when this spec is complete..."
                read -r
            fi
        fi
    done

    echo -e "${GREEN}All specs processed!${NC}"
}

# Parse arguments
SPEC_NAME=""
RUN_ALL=false
FULL_AUTO=false
QUIET=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        -s|--spec)
            SPEC_NAME="$2"
            shift 2
            ;;
        -a|--all)
            RUN_ALL=true
            shift
            ;;
        -l|--list)
            list_specs
            exit 0
            ;;
        -f|--full-auto)
            FULL_AUTO=true
            shift
            ;;
        -q|--quiet)
            QUIET=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main execution
if [ -n "$SPEC_NAME" ]; then
    run_spec "$SPEC_NAME"
elif [ "$RUN_ALL" = true ]; then
    run_all_specs "$FULL_AUTO"
else
    usage
    exit 1
fi
