#!/usr/bin/env sh
set -eu

VERSION="${CITADELA_VERSION:-0.5.11}"
REGISTRY_BASE="https://registry.npmjs.org/@citadela/cli/-/cli-${VERSION}.tgz"

OS="$(uname -s)"
ARCH="$(uname -m)"
case "${OS}:${ARCH}" in
  Linux:x86_64|Linux:amd64) TARGET="linux-x64"; LIBRARY="libopentui.so" ;;
  Linux:aarch64|Linux:arm64) TARGET="linux-arm64"; LIBRARY="libopentui.so" ;;
  Darwin:x86_64|Darwin:amd64) TARGET="darwin-x64"; LIBRARY="libopentui.dylib" ;;
  Darwin:arm64|Darwin:aarch64) TARGET="darwin-arm64"; LIBRARY="libopentui.dylib" ;;
  *) echo "Unsupported Citadela platform: ${OS} ${ARCH}" >&2; exit 1 ;;
esac

if [ "$(id -u)" -eq 0 ]; then
  INSTALL_ROOT="/usr/local/lib/citadela/${VERSION}"
  BIN_PATH="/usr/local/bin/citadela"
else
  INSTALL_ROOT="${HOME}/.local/lib/citadela/${VERSION}"
  BIN_PATH="${HOME}/.local/bin/citadela"
fi

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t citadela)"
trap 'rm -rf "${TMP_DIR}"' EXIT INT TERM
ARCHIVE="${TMP_DIR}/citadela.tgz"

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "tar is required" >&2; exit 1; }

echo "Downloading Citadela CLI ${VERSION} for ${TARGET}..."
curl --fail --location --proto '=https' --tlsv1.2 --silent --show-error "${REGISTRY_BASE}" --output "${ARCHIVE}"
tar -xzf "${ARCHIVE}" -C "${TMP_DIR}"

SOURCE_DIR="${TMP_DIR}/package/dist/bin"
if [ ! -f "${SOURCE_DIR}/citadela-${TARGET}" ] || [ ! -f "${SOURCE_DIR}/${LIBRARY}" ]; then
  echo "No native Citadela artifact is published for ${TARGET} in ${VERSION}." >&2
  exit 1
fi

mkdir -p "${INSTALL_ROOT}" "$(dirname "${BIN_PATH}")"
cp "${SOURCE_DIR}/citadela-${TARGET}" "${INSTALL_ROOT}/citadela"
cp "${SOURCE_DIR}/${LIBRARY}" "${INSTALL_ROOT}/${LIBRARY}"
chmod 755 "${INSTALL_ROOT}/citadela"
chmod 644 "${INSTALL_ROOT}/${LIBRARY}"
ln -sfn "${INSTALL_ROOT}/citadela" "${BIN_PATH}"

echo "Citadela CLI ${VERSION} installed at ${BIN_PATH}"
if [ "$(id -u)" -ne 0 ] && ! printf '%s' ":${PATH}:" | grep -q ":${HOME}/.local/bin:"; then
  echo "Add ${HOME}/.local/bin to PATH to use citadela globally."
fi
